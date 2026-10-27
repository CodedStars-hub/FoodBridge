import { runMaintenance } from '../src/services/maintenanceService.js';
process.exitCode = await runMaintenance('expire_donations');
