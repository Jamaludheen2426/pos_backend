import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/users.controller';
import { authenticate, requireManager } from '../middleware/auth';

const router = Router();

// All user routes — company-scoped, manager+
router.use(authenticate, requireManager);

router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
