// models/Poll.js
const mongoose = require('mongoose');

const OptionSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  text: { type: String, required: true },
  votes: { type: Number, default: 0 }
});

const PollSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: "सामान्य"
  },
  state: {
    type: String,
    default: "राजस्थान"
  },
  district: {
    type: String,
    default: "सभी"
  },
  samiti: {
    type: String,
    default: "सभी"
  },
  totalVotes: {
    type: Number,
    default: 0
  },
  options: [OptionSchema],
  // एक वोटर दोबारा वोट न दे पाए, उसके लिए Identifiers की लिस्ट
  voters: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Poll', PollSchema);