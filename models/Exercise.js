const mongoose = require('mongoose');

const ExerciseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: String, 
  filterParams: {
    cutoffFreq: { type: Number, default: 5 },  
    minPeakHeight: { type: Number, default: 0.3 },
    minPeakDistance: { type: Number, default: 0.5 } 
  }
});

module.exports = mongoose.model('Exercise', ExerciseSchema);