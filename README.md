# study_buddy_ai_assist

## Study Buddy AI

Track your study sessions, log what you learned, and take AI-generated tests (Gemini) built from your own notes.
Stack: Node.js, Express, MongoDB (Mongoose), vanilla JS frontend.

## Run it (VS Code terminal)
1. Install Node 18+ and MongoDB (or use a free MongoDB Atlas cluster).
2. Open `.env` and set:
   - `MONGODB_URI` - your MongoDB connection link
   - `GEMINI_API_KEY` - free key from https://aistudio.google.com/apikey
   - `APP_PASSWORD` - shared password for the app (required in production)
3. Run:
   ```
   npm install
   npm start
   ```
4. Open http://localhost:3000

The app uses HTTP Basic Auth with username `studybuddy` when `APP_PASSWORD` is set. In production, `APP_PASSWORD` is required. Everyone who has the shared password sees the same study data, so use a separate database for demos and do not store sensitive notes in a publicly shared deployment.

## How to use
- Topics: add a topic and paste your notes.
- Log study: record minutes and what you learned in your own words.
- Take a test: Gemini writes multiple-choice questions from your notes and logs; answers are graded on the server.
- Dashboard and Results: streak, hours, average score, weak topics.

Background photos live in `public/images/` (bg1-bg5.jpeg) and rotate automatically.
Quotes are in `public/app.js` (`quotes` array). If the model name is rejected, change `GEMINI_MODEL` in `.env`.
