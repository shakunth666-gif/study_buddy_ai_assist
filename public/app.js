const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

async function api(url, method = 'GET', body) {
  const r = await fetch('/api' + url, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
let toastTimer;
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3500);
}
const run = async fn => { try { await fn(); } catch (e) { toast(e.message, true); } };

/* ---------- background photos + quotes ---------- */
const photos = [1, 2, 3, 4, 5].map(i => `/images/bg${i}.jpeg`);
let pi = 0, layer = 'A';
function nextPhoto() {
  const el = $('#bg' + layer), other = $('#bg' + (layer === 'A' ? 'B' : 'A'));
  el.style.backgroundImage = `url(${photos[pi]})`;
  el.classList.add('show'); other.classList.remove('show');
  layer = layer === 'A' ? 'B' : 'A'; pi = (pi + 1) % photos.length;
}
nextPhoto(); setInterval(nextPhoto, 12000);

const quotes = [
  'Small steps every day beat big pushes once a month.',
  'You don\u2019t need to feel ready. You need to open the book.',
  'Being confused is the feeling of learning happening.',
  'Test yourself often. Recognising is not the same as remembering.',
  'Progress is quiet. Consistency is what makes it loud.',
  'Rest is part of the plan, not a break from it.',
  'One focused hour is worth three distracted ones.',
  'Mistakes in practice are cheaper than mistakes in the exam.',
  'Study until you don\u2019t have to worry about your results.',
  'Reset, restart, refocus.'
];
let qi = 0;
function showQuote() {
  const q = $('#quoteMain'); q.classList.add('fade');
  setTimeout(() => { q.textContent = '\u201C' + quotes[qi] + '\u201D'; q.classList.remove('fade'); qi = (qi + 1) % quotes.length; }, 450);
}
showQuote(); setInterval(showQuote, 9000);
$('#pins').innerHTML = ['Failing was never an option.', 'Intention. Dedication. Consistency.', 'Your future rank depends on today\u2019s efforts.', 'Reset, restart, refocus.']
  .map(t => `<div class="pin">${esc(t)}</div>`).join('');

/* ---------- tabs ---------- */
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + b.dataset.view));
  refresh(b.dataset.view);
});
function refresh(view) {
  if (view === 'dashboard') loadDashboard();
  if (view === 'topics') loadTopics();
  if (view === 'log') { fillTopicSelects(); loadSessions(); }
  if (view === 'test') fillTopicSelects();
  if (view === 'history') loadHistory();
}

/* ---------- dashboard ---------- */
async function loadDashboard() {
  await run(async () => {
    const s = await api('/stats');
    const hrs = (s.totalMinutes / 60).toFixed(1);
    const weak = s.perTopic.filter(t => t.tests === 0 || t.avg < 60);
    $('#view-dashboard').innerHTML = `
      <div class="stats">
        <div class="stat"><b>${s.streak}</b><span>day streak</span></div>
        <div class="stat"><b>${hrs}h</b><span>studied in total</span></div>
        <div class="stat"><b>${s.sessions}</b><span>sessions logged</span></div>
        <div class="stat"><b>${s.tests}</b><span>tests taken</span></div>
        <div class="stat"><b>${s.avgScore === null ? '\u2013' : s.avgScore + '%'}</b><span>average score</span></div>
      </div>
      <h2>What you actually know</h2>
      ${s.perTopic.length ? s.perTopic.map(t => `
        <div class="row"><div style="flex:1">
          <strong>${esc(t.name)}</strong> <span class="meta">${esc(t.subject)} \u00B7 ${Math.round(t.minutes)} min \u00B7 confidence ${t.confidence}/5</span>
          <div class="bar"><i class="${t.avg === null ? '' : t.avg < 60 ? 'low' : t.avg >= 80 ? 'high' : ''}" style="width:${t.avg ?? 0}%"></i></div>
          <span class="meta">${t.avg === null ? 'Not tested yet' : `Average ${t.avg}% over ${t.tests} test(s), latest ${t.last}%`}</span>
        </div></div>`).join('') : '<p class="empty">Add your first topic in the Topics tab.</p>'}
      ${weak.length ? `<h2>Review next</h2><p>${weak.map(t => esc(t.name)).join(', ')}</p>` : ''}`;
  });
}

/* ---------- topics ---------- */
async function loadTopics() {
  await run(async () => {
    const list = await api('/topics');
    $('#topicList').innerHTML = list.length ? list.map(t => `
      <div class="row"><div><strong>${esc(t.name)}</strong> <span class="meta">${esc(t.subject)} \u00B7 confidence ${t.confidence}/5</span>
      ${t.notes ? `<p>${esc(t.notes.slice(0, 220))}${t.notes.length > 220 ? '\u2026' : ''}</p>` : ''}</div>
      <button class="ghost" data-del="${t._id}">Delete</button></div>`).join('') : '<p class="empty">No topics yet.</p>';
  });
}
$('#addTopic').onclick = () => run(async () => {
  await api('/topics', 'POST', { name: $('#tName').value, subject: $('#tSubject').value, notes: $('#tNotes').value, confidence: +$('#tConf').value });
  ['#tName', '#tSubject', '#tNotes'].forEach(id => $(id).value = '');
  toast('Topic added'); loadTopics();
});
$('#topicList').addEventListener('click', e => {
  const id = e.target.dataset.del; if (!id) return;
  if (confirm('Delete this topic and all its sessions and tests?')) run(async () => { await api('/topics/' + id, 'DELETE'); toast('Topic deleted'); loadTopics(); });
});

async function fillTopicSelects() {
  await run(async () => {
    const list = await api('/topics');
    const html = list.length ? list.map(t => `<option value="${t._id}">${esc(t.name)} (${esc(t.subject)})</option>`).join('') : '<option value="">Add a topic first</option>';
    $('#lTopic').innerHTML = html; $('#qTopic').innerHTML = html;
  });
}

/* ---------- sessions ---------- */
async function loadSessions() {
  await run(async () => {
    const list = await api('/sessions');
    $('#sessionList').innerHTML = list.length ? list.map(s => `
      <div class="row"><div><strong>${esc(s.topic?.name || 'Deleted topic')}</strong> <span class="meta">${s.minutes} min \u00B7 ${fmtDate(s.createdAt)}</span>
      ${s.learned ? `<p>${esc(s.learned)}</p>` : ''}</div><button class="ghost" data-sdel="${s._id}">Delete</button></div>`).join('') : '<p class="empty">No sessions logged yet.</p>';
  });
}
$('#addSession').onclick = () => run(async () => {
  await api('/sessions', 'POST', { topic: $('#lTopic').value, minutes: +$('#lMin').value, learned: $('#lLearned').value });
  $('#lLearned').value = ''; toast('Session saved'); loadSessions();
});
$('#sessionList').addEventListener('click', e => {
  const id = e.target.dataset.sdel; if (!id) return;
  run(async () => { await api('/sessions/' + id, 'DELETE'); loadSessions(); });
});

/* ---------- quiz ---------- */
let current = null;
$('#startTest').onclick = async () => {
  const btn = $('#startTest'); btn.disabled = true; btn.textContent = 'Generating\u2026';
  await run(async () => {
    current = await api('/quiz/generate', 'POST', { topicId: $('#qTopic').value, count: +$('#qCount').value });
    renderQuiz();
  });
  btn.disabled = false; btn.textContent = 'Generate test';
};
function renderQuiz() {
  $('#quiz').innerHTML = current.questions.map((q, i) => `
    <div class="q"><h3>${i + 1}. ${esc(q.question)}</h3>
    ${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}"> <span>${esc(o)}</span></label>`).join('')}</div>`).join('')
    + '<button class="primary" id="submitTest">Submit answers</button>';
  $('#submitTest').onclick = submitQuiz;
}
async function submitQuiz() {
  const answers = current.questions.map((_, i) => { const c = document.querySelector(`input[name="q${i}"]:checked`); return c ? +c.value : -1; });
  if (answers.includes(-1) && !confirm('Some questions are unanswered. Submit anyway?')) return;
  await run(async () => {
    const r = await api(`/quiz/${current.testId}/submit`, 'POST', { answers });
    $('#quiz').innerHTML = `<div class="score">${r.score} / ${r.total}</div><p>${r.score / r.total >= .8 ? 'Strong. You know this.' : r.score / r.total >= .5 ? 'Getting there. Review the misses below.' : 'Needs more work. Re-read your notes and try again.'}</p>` + reviewHtml(r.questions);
    current = null;
  });
}
function reviewHtml(questions) {
  return questions.map((q, i) => `
    <div class="q"><h3>${i + 1}. ${esc(q.question)}</h3>
    ${q.options.map((o, j) => `<div class="opt ${j === q.answerIndex ? 'right' : j === q.chosen ? 'wrong' : ''}">${j === q.answerIndex ? '\u2713' : j === q.chosen ? '\u2717' : '\u00A0'} <span>${esc(o)}</span></div>`).join('')}
    ${q.explanation ? `<div class="why">${esc(q.explanation)}</div>` : ''}</div>`).join('');
}

/* ---------- history ---------- */
async function loadHistory() {
  await run(async () => {
    const list = await api('/tests');
    $('#historyList').innerHTML = list.length ? list.map(t => `
      <details><summary>${esc(t.topic?.name || 'Deleted topic')} \u2013 ${t.score}/${t.total} <span class="meta">${fmtDate(t.createdAt)}</span></summary>
      <div style="margin-top:10px">${reviewHtml(t.questions)}</div></details>`).join('') : '<p class="empty">No tests taken yet.</p>';
  });
}

loadDashboard();
