import { Router } from 'express';
import { openShift, closeShift, getCurrentShift, listShifts, getShiftSummary } from '../controllers/shifts.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';
import { validate, openShiftSchema, closeShiftSchema } from '../middleware/validate';

const router = Router();

router.use(authenticate, requireCashier);

router.post('/open', validate(openShiftSchema), openShift);
router.post('/:id/close', validate(closeShiftSchema), closeShift);
router.get('/current', getCurrentShift);
router.get('/', requireManager, listShifts);
router.get('/:id/summary', requireManager, getShiftSummary);

export default router;
