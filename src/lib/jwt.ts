import jwt from 'jsonwebtoken';
import ms from 'ms';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  userId: number;
  companyId: number | null;
  role: string;
  platform: 'web' | 'mobile';
}

function toSeconds(val: string): number {
  return Math.floor(ms(val as Parameters<typeof ms>[0]) / 1000);
}

export const signAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload as object, JWT_SECRET, {
    expiresIn: toSeconds(process.env.JWT_ACCESS_EXPIRES || '15m'),
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  const dur =
    payload.platform === 'mobile'
      ? process.env.JWT_REFRESH_MOBILE_EXPIRES || '365d'
      : process.env.JWT_REFRESH_WEB_EXPIRES || '15d';

  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: toSeconds(dur) });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
