import { Router } from 'express';
import {
  listDiscountRules,
  createDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
  validateDiscountCode,
} from '../controllers/discountRules.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireCashier, listDiscountRules);
router.post('/', requireManager, createDiscountRule);
router.post('/validate', requireCashier, validateDiscountCode);
router.patch('/:id', requireManager, updateDiscountRule);
router.delete('/:id', requireManager, deleteDiscountRule);

export default router;
