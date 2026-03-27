import { Router } from 'express';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../controllers/suppliers.controller';
import { authenticate, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireManager);

router.get('/', listSuppliers);
router.post('/', createSupplier);
router.patch('/:id', updateSupplier);
router.delete('/:id', deleteSupplier);

export default router;
