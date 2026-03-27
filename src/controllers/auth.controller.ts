import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyToken } from '../lib/jwt';
import { AuthRequest } from '../middleware/auth';

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password, platform = 'web' } = req.body;

  if (!email || !password) {
    res.status(400).json({ message: 'Email and password required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  // Mobile can also login with mobilePasswordHash
  let passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch && platform === 'mobile' && user.mobilePasswordHash) {
    passwordMatch = await bcrypt.compare(password, user.mobilePasswordHash);
  }

  if (!passwordMatch) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const payload = {
    userId: user.id,
    companyId: user.companyId,
    role: user.role,
    platform: platform as 'web' | 'mobile',
  };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt =
    platform === 'mobile'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshToken, platform: platform === 'mobile' ? 'MOBILE' : 'WEB', expiresAt },
  });

  const company = user.companyId
    ? await prisma.company.findUnique({
        where: { id: user.companyId },
        select: { id: true, name: true, settings: true },
      })
    : null;

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId, storeId: user.storeId },
    company,
  });
};

export const refreshTokens = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyToken(refreshToken);
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }

    const newAccessToken = signAccessToken({
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
      platform: payload.platform,
    });

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  }
  res.json({ message: 'Logged out' });
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true, name: true, email: true, role: true, companyId: true, storeId: true,
      store: { select: { id: true, name: true } },
      company: {
        select: {
          id: true, name: true,
          settings: true,
        },
      },
    },
  });
  if (!user) { res.status(404).json({ message: 'User not found' }); return; }
  const { company, ...userData } = user;
  res.json({ user: userData, company });
};
