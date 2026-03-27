import { Router } from 'express';
import { listTaxRates, createTaxRate, updateTaxRate, deleteTaxRate } from '../controllers/taxRates.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireCashier, listTaxRates);
router.post('/', requireManager, createTaxRate);
router.patch('/:id', requireManager, updateTaxRate);
router.delete('/:id', requireManager, deleteTaxRate);

export default router;
