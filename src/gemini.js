// Calls the Gemini REST API directly (Node 18+ has fetch built in).
async function generateQuiz({ topic, sessions, count }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.startsWith('your_')) {
    throw new Error('GEMINI_API_KEY is missing. Add your free key to the .env file and restart the server.');
  }
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const learned = sessions.map(s => `- ${s.learned}`).filter(l => l.length > 2).join('\n') || '(nothing logged yet)';
  const prompt = `You are a strict but friendly examiner. Create ${count} multiple-choice questions to test whether a student really learned this topic.

Subject: ${topic.subject}
Topic: ${topic.name}
Student's notes: ${topic.notes || '(none)'}
What the student says they learned in their own words:
${learned}

Rules:
- Questions must test understanding of the topic, focusing on the notes and points above; you may add closely related core concepts.
- Mix easy, medium and hard questions. Exactly 4 options each, only one correct.
- Explanations are 1-2 sentences.
Return ONLY a JSON array, no markdown, in this shape:
[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini error: ${data.error?.message || res.statusText}`);

  let text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  text = text.replace(/```json|```/g, '').trim();
  let arr;
  try { arr = JSON.parse(text); } catch { throw new Error('Gemini returned an unreadable quiz. Please try again.'); }
  const clean = (Array.isArray(arr) ? arr : arr.questions || [])
    .filter(q => q && q.question && Array.isArray(q.options) && q.options.length === 4
      && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4)
    .map(q => ({ question: String(q.question), options: q.options.map(String), answerIndex: q.answerIndex, explanation: String(q.explanation || '') }));
  if (!clean.length) throw new Error('Gemini did not return valid questions. Please try again.');
  return clean;
}
module.exports = { generateQuiz };
