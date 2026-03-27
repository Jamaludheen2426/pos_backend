import { Router } from 'express';
import { listSubscriptions, createSubscription, updateSubscription } from '../controllers/subscriptions.controller';
import { authenticate, requireCreator } from '../middleware/auth';

const router = Router();

// All subscription routes — creator only
router.use(authenticate, requireCreator);

router.get('/', listSubscriptions);
router.post('/', createSubscription);
router.patch('/:id', updateSubscription);

export default router;
