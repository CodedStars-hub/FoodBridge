import mongoose from 'mongoose';
export function getHealth(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'ok',
    application: 'FoodBridge',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

export async function getReadiness(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db)
      throw new Error('Dependency unavailable');
    const db = mongoose.connection.db.admin();
    const [ping, hello] = await Promise.all([
      db.command({ ping: 1 }, { timeoutMS: 2000 }),
      db.command({ hello: 1 }, { timeoutMS: 2000 }),
    ]);
    if (
      ping.ok !== 1 ||
      (!hello.setName && hello.msg !== 'isdbgrid') ||
      hello.logicalSessionTimeoutMinutes == null
    )
      throw new Error('Dependency unavailable');
    res.json({ status: 'ready', application: 'FoodBridge' });
  } catch (error) {
    req.app
      .get('logger')
      ?.warn('readiness_failed', { requestId: req.requestId, error });
    res.status(503).json({ status: 'not_ready', application: 'FoodBridge' });
  }
}
