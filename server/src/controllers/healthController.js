export function getHealth(_req, res) {
  res.status(200).json({
    status: 'ok',
    application: 'FoodBridge',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
