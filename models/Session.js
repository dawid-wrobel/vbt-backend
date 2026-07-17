const mongoose = require('mongoose');

const RepSchema = new mongoose.Schema({
  repNumber: Number,
  concentricDuration: Number,  // ms
  eccentricDuration: Number,   // ms
  peakVelocity: Number,        // m/s
  avgVelocity: Number,         // m/s
  velocityLoss: Number         // %
});

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise' },
  exerciseName: String,
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  reps: [RepSchema],
  rawData: [{
    t: Number, 
    ax: Number, ay: Number, az: Number,
    gx: Number, gy: Number, gz: Number
  }],
  summary: {
    totalReps: Number,
    avgConcentricDuration: Number,
    avgEccentricDuration: Number,
    avgVelocity: Number,
    peakVelocity: Number,
  }
});

module.exports = mongoose.model('Session', SessionSchema);