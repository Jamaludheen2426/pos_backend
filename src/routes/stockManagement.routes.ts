import { Router } from 'express';
import { adjustStock, transferStock, listStockMovements } from '../controllers/stockManagement.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';
import { validate, adjustStockSchema, transferStockSchema } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post('/adjust', requireManager, validate(adjustStockSchema), adjustStock);
router.post('/transfer', requireManager, validate(transferStockSchema), transferStock);
router.get('/movements', requireCashier, listStockMovements);

export default router;
