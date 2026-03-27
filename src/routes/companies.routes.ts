import { Router } from 'express';
import {
  listCompanies,
  createCompany,
  updateCompanyStatus,
  updateModules,
  updateOfflineDays,
  impersonateCompany,
  forceLogoutCompany,
  deleteCompany,
  updateBranding,
} from '../controllers/companies.controller';
import { authenticate, requireCreator } from '../middleware/auth';

const router = Router();

// All company routes — creator only
router.use(authenticate, requireCreator);

router.get('/', listCompanies);
router.post('/', createCompany);
router.patch('/:id/status', updateCompanyStatus);
router.patch('/:id/modules', updateModules);
router.patch('/:id/offline-days', updateOfflineDays);
router.patch('/:id/branding', updateBranding);
router.post('/:id/impersonate', impersonateCompany);
router.post('/:id/force-logout', forceLogoutCompany);
router.delete('/:id', deleteCompany);

export default router;
