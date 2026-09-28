require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { Topic, Session, Test } = require('./src/models');
const { generateQuiz } = require('./src/gemini');

const app = express();
const appPassword = process.env.APP_PASSWORD;
if (process.env.NODE_ENV === 'production' && !appPassword) {
  console.error('APP_PASSWORD is required in production');
  process.exit(1);
}

if (appPassword) {
  app.use((req, res, next) => {
    const match = (req.get('authorization') || '').match(/^Basic\s+(.+)$/i);
    const credentials = match ? Buffer.from(match[1], 'base64').toString('utf8') : '';
    const separator = credentials.indexOf(':');
    const username = separator >= 0 ? credentials.slice(0, separator) : '';
    const password = separator >= 0 ? credentials.slice(separator + 1) : '';
    const passwordHash = crypto.createHash('sha256').update(password).digest();
    const expectedHash = crypto.createHash('sha256').update(appPassword).digest();

    if (username !== 'studybuddy' || !crypto.timingSafeEqual(passwordHash, expectedHash)) {
      res.set('WWW-Authenticate', 'Basic realm="Study Buddy"');
      return res.status(401).send('Authentication required.');
    }

    next();
  });
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e.message);
  res.status(e.status || 500).json({ error: e.message });
});
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const validId = id => mongoose.isValidObjectId(id);

/* ---------- Topics ---------- */
app.get('/api/topics', wrap(async (req, res) => res.json(await Topic.find().sort({ createdAt: -1 }))));

app.post('/api/topics', wrap(async (req, res) => {
  const { name, subject, notes, confidence } = req.body;
  if (!name || !name.trim()) throw bad('Topic name is required.');
  res.status(201).json(await Topic.create({ name, subject: subject || 'General', notes, confidence }));
}));

app.delete('/api/topics/:id', wrap(async (req, res) => {
  if (!validId(req.params.id)) throw bad('Invalid id.');
  await Promise.all([
    Topic.findByIdAndDelete(req.params.id),
    Session.deleteMany({ topic: req.params.id }),
    Test.deleteMany({ topic: req.params.id })
  ]);
  res.json({ ok: true });
}));

/* ---------- Study sessions ---------- */
app.get('/api/sessions', wrap(async (req, res) =>
  res.json(await Session.find().sort({ createdAt: -1 }).limit(30).populate('topic', 'name subject'))));

app.post('/api/sessions', wrap(async (req, res) => {
  const { topic, minutes, learned } = req.body;
  if (!validId(topic) || !(await Topic.exists({ _id: topic }))) throw bad('Choose a topic first.');
  if (!(Number(minutes) >= 1)) throw bad('Minutes must be at least 1.');
  res.status(201).json(await Session.create({ topic, minutes: Number(minutes), learned }));
}));

app.delete('/api/sessions/:id', wrap(async (req, res) => {
  if (!validId(req.params.id)) throw bad('Invalid id.');
  await Session.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

/* ---------- Quiz ---------- */
app.post('/api/quiz/generate', wrap(async (req, res) => {
  const { topicId } = req.body;
  const count = Math.min(Math.max(parseInt(req.body.count) || 5, 3), 15);
  if (!validId(topicId)) throw bad('Choose a topic first.');
  const topic = await Topic.findById(topicId);
  if (!topic) throw bad('Topic not found.', 404);
  const sessions = await Session.find({ topic: topicId }).sort({ createdAt: -1 }).limit(15);
  const questions = await generateQuiz({ topic, sessions, count });
  const test = await Test.create({ topic: topicId, questions, total: questions.length });
  // answers are NOT sent to the browser until the test is submitted
  res.json({
    testId: test._id,
    questions: test.questions.map(q => ({ question: q.question, options: q.options }))
  });
}));

app.post('/api/quiz/:id/submit', wrap(async (req, res) => {
  if (!validId(req.params.id)) throw bad('Invalid id.');
  const test = await Test.findById(req.params.id);
  if (!test) throw bad('Test not found.', 404);
  if (test.submitted) throw bad('This test was already submitted.');
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  let score = 0;
  test.questions.forEach((q, i) => {
    q.chosen = Number.isInteger(answers[i]) ? answers[i] : -1;
    if (q.chosen === q.answerIndex) score++;
  });
  test.score = score;
  test.submitted = true;
  await test.save();
  res.json({ score, total: test.total, questions: test.questions });
}));

app.get('/api/tests', wrap(async (req, res) =>
  res.json(await Test.find({ submitted: true }).sort({ createdAt: -1 }).limit(30).populate('topic', 'name subject'))));

/* ---------- Dashboard stats ---------- */
app.get('/api/stats', wrap(async (req, res) => {
  const [topics, sessions, tests] = await Promise.all([
    Topic.find(), Session.find(), Test.find({ submitted: true })
  ]);
  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const pct = t => (t.total ? (t.score / t.total) * 100 : 0);
  const avgScore = tests.length ? Math.round(tests.reduce((a, t) => a + pct(t), 0) / tests.length) : null;

  const perTopic = topics.map(t => {
    const ts = tests.filter(x => String(x.topic) === String(t._id)).sort((a, b) => b.createdAt - a.createdAt);
    const ss = sessions.filter(x => String(x.topic) === String(t._id));
    return {
      _id: t._id, name: t.name, subject: t.subject, confidence: t.confidence,
      minutes: ss.reduce((a, s) => a + s.minutes, 0),
      tests: ts.length,
      avg: ts.length ? Math.round(ts.reduce((a, x) => a + pct(x), 0) / ts.length) : null,
      last: ts.length ? Math.round(pct(ts[0])) : null
    };
  });

  // streak = consecutive days (ending today or yesterday) with a session or test
  const day = d => new Date(d).toLocaleDateString('en-CA');
  const days = new Set([...sessions, ...tests].map(x => day(x.createdAt)));
  let streak = 0;
  const cur = new Date();
  if (!days.has(day(cur))) cur.setDate(cur.getDate() - 1);
  while (days.has(day(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

  res.json({ topics: topics.length, sessions: sessions.length, totalMinutes, tests: tests.length, avgScore, streak, perTopic });
}));

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is missing in .env');
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Study Buddy AI running at http://localhost:${PORT}`));
  })
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
