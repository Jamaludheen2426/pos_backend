import { Router } from 'express';
import { listPlans, createPlan, updatePlan, deletePlan } from '../controllers/plans.controller';
import { authenticate, requireCreator } from '../middleware/auth';

const router = Router();

// All plan routes — creator only
router.use(authenticate, requireCreator);

router.get('/', listPlans);
router.post('/', createPlan);
router.patch('/:id', updatePlan);
router.delete('/:id', deletePlan);

export default router;
