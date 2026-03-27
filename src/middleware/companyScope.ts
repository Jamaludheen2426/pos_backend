import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

// Ensures all DB queries are scoped to the authenticated user's company
export const scopeToCompany = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.companyId) {
    res.status(403).json({ message: 'No company scope' });
    return;
  }
  next();
};
