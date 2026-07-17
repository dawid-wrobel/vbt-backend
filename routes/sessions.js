const router = require('express').Router();
const Session = require('../models/Session');
const auth = require('./middleware');

router.post('/ingest', auth, async (req, res) => {
  try {
    const { exerciseId, exerciseName, rawData, filterParams } = req.body;
    const analysis = analyzeSession(rawData, filterParams || {});

    const session = await Session.create({
      userId: req.user.id,
      exerciseId,
      exerciseName,
      endTime: new Date(),
      rawData,
      reps: analysis.reps,
      summary: analysis.summary
    });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/rep', auth, async (req, res) => {
  try {
    const { sessionId, rep } = req.body;
    const session = await Session.findByIdAndUpdate(
      sessionId,
      { $push: { reps: rep } },
      { returnDocument: 'after' }
    );
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/start', auth, async (req, res) => {
  try {
    const { exerciseId, exerciseName } = req.body;
    const session = await Session.create({
      userId: req.user.id,
      exerciseId,
      exerciseName,
      reps: []
    });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/finish', auth, async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found' });

    const reps = session.reps;
    if (reps.length > 0) {
      const avgVelocity = avg(reps.map(r => r.avgVelocity));
      const peakVelocity = Math.max(...reps.map(r => r.peakVelocity));
      const velocityLoss = reps.length > 1
        ? ((reps[0].avgVelocity - reps[reps.length - 1].avgVelocity) / reps[0].avgVelocity) * 100
        : 0;

      session.summary = {
        totalReps: reps.length,
        avgConcentricDuration: avg(reps.map(r => r.concentricDuration)),
        avgEccentricDuration: avg(reps.map(r => r.eccentricDuration)),
        avgVelocity,
        peakVelocity,
        velocityLoss,
      };
    }
    session.endTime = new Date();
    await session.save();
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', auth, async (req, res) => {
  const sessions = await Session.find({ userId: req.user.id })
    .sort({ startTime: -1 }).limit(50).select('-rawData');
  res.json(sessions);
});

router.get('/:id', auth, async (req, res) => {
  const session = await Session.findOne({ _id: req.params.id, userId: req.user.id });
  if (!session) return res.status(404).json({ error: 'Not found' });
  res.json(session);
});

router.get('/:id/export', auth, async (req, res) => {
  const { format = 'json' } = req.query;
  const session = await Session.findOne({ _id: req.params.id, userId: req.user.id });
  if (!session) return res.status(404).json({ error: 'Not found' });

  if (format === 'csv') {
    const header = 'rep,concentricDuration,eccentricDuration,peakVelocity,avgVelocity,velocityLoss\n';
    const rows = session.reps.map(r =>
      `${r.repNumber},${r.concentricDuration},${r.eccentricDuration},${r.peakVelocity},${r.avgVelocity},${r.velocityLoss}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.send(header + rows);
  } else {
    res.json(session);
  }
});

function analyzeSession(rawData, params) {
  const { minPeakHeight = 0.3, minPeakDistance = 0.5 } = params;
  if (!rawData || rawData.length === 0) return { reps: [], summary: {} };

  const dt = 0.01;
  let velocity = 0;
  const velocities = [];

  for (let i = 1; i < rawData.length; i++) {
    const az = rawData[i].az - 9.81;
    velocity += az * dt;
    velocities.push({ t: rawData[i].t, v: velocity });
  }

  const reps = [];
  let repStart = null;
  let phase = 'idle';
  let repNum = 1;
  const minDistMs = minPeakDistance * 1000;

  for (let i = 1; i < velocities.length; i++) {
    const prev = velocities[i - 1].v;
    const curr = velocities[i].v;
    const t = velocities[i].t;

    if (prev <= 0 && curr > 0 && Math.abs(curr) > minPeakHeight) {
      repStart = t;
      phase = 'concentric';
    } else if (prev > 0 && curr <= 0 && phase === 'concentric' && repStart && (t - repStart) > minDistMs) {
      const concentricDuration = t - repStart;
      const eccentricStart = t;

      let eccentricDuration = 500; 
      for (let j = i + 1; j < velocities.length; j++) {
        if (velocities[j].v > 0) {
          eccentricDuration = velocities[j].t - eccentricStart;
          break;
        }
      }

      const repVelocities = velocities
        .filter(v => v.t >= repStart && v.t <= t)
        .map(v => Math.abs(v.v));

      const peakVelocity = repVelocities.length ? Math.max(...repVelocities) : 0;
      const avgVelocity = repVelocities.length ? avg(repVelocities) : 0;
      const prevAvg = reps.length > 0 ? reps[0].avgVelocity : avgVelocity;
      const velocityLoss = prevAvg > 0 ? ((prevAvg - avgVelocity) / prevAvg) * 100 : 0;

      reps.push({ repNumber: repNum++, concentricDuration, eccentricDuration, peakVelocity, avgVelocity, velocityLoss });
      repStart = null;
      phase = 'idle';
    }
  }

  const summary = reps.length ? {
    totalReps: reps.length,
    avgConcentricDuration: avg(reps.map(r => r.concentricDuration)),
    avgEccentricDuration: avg(reps.map(r => r.eccentricDuration)),
    avgVelocity: avg(reps.map(r => r.avgVelocity)),
    peakVelocity: Math.max(...reps.map(r => r.peakVelocity)),
    velocityLoss: reps[reps.length - 1].velocityLoss,
    fatigueIndex: Math.min(100, Math.round(reps[reps.length - 1].velocityLoss * 2))
  } : {};

  return { reps, summary };
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

module.exports = router;