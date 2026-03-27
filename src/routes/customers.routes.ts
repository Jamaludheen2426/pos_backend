import { Router } from 'express';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '../controllers/customers.controller';
import { authenticate, requireCashier } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireCashier);

router.get('/', listCustomers);
router.post('/', createCustomer);
router.patch('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;
