import { Router } from 'express';
import { getHealth, getReadiness } from '../controllers/healthController.js';
const router = Router();
router.get('/', getHealth);
router.get('/ready', getReadiness);
export default router;
