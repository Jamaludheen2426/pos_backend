import { Router } from 'express';
import { adjustStock, transferStock, listStockMovements } from '../controllers/stockManagement.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.post('/adjust', requireManager, adjustStock);
router.post('/transfer', requireManager, transferStock);
router.get('/movements', requireCashier, listStockMovements);

export default router;
