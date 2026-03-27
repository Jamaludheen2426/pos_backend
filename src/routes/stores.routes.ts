import { Router } from 'express';
import { listStores, createStore, updateStore, deleteStore } from '../controllers/stores.controller';
import { authenticate, requireManager } from '../middleware/auth';

const router = Router();

// All store routes — company-scoped, manager+
router.use(authenticate, requireManager);

router.get('/', listStores);
router.post('/', createStore);
router.patch('/:id', updateStore);
router.delete('/:id', deleteStore);

export default router;
