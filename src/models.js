const mongoose = require('mongoose');
const { Schema } = mongoose;

const Topic = mongoose.model('Topic', new Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, default: 'General', trim: true },
  notes: { type: String, default: '' },
  confidence: { type: Number, min: 1, max: 5, default: 3 }
}, { timestamps: true }));

const Session = mongoose.model('Session', new Schema({
  topic: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
  minutes: { type: Number, min: 1, required: true },
  learned: { type: String, default: '' }
}, { timestamps: true }));

const Test = mongoose.model('Test', new Schema({
  topic: { type: Schema.Types.ObjectId, ref: 'Topic', required: true },
  questions: [{
    question: String,
    options: [String],
    answerIndex: Number,
    explanation: String,
    chosen: { type: Number, default: -1 }
  }],
  score: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  submitted: { type: Boolean, default: false }
}, { timestamps: true }));

module.exports = { Topic, Session, Test };
