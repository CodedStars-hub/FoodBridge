import { runMaintenance } from '../src/services/maintenanceService.js';
process.exitCode = await runMaintenance('cleanup_images');
