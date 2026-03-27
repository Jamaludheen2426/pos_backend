import { Router } from 'express';
import { login, refreshTokens, logout, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/refresh', refreshTokens);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;
