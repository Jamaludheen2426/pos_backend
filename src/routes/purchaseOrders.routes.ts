import { Router } from 'express';
import { listPurchaseOrders, createPurchaseOrder, receivePurchaseOrder } from '../controllers/purchaseOrders.controller';
import { authenticate, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireManager);

router.get('/', listPurchaseOrders);
router.post('/', createPurchaseOrder);
router.patch('/:id/receive', receivePurchaseOrder);

export default router;
