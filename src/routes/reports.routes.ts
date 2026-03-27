import { Router } from 'express';
import { getDashboard, getReportSummary, getSalesSummary, downloadExcel, getStaffPerformance, getEODReport } from '../controllers/reports.controller';
import { authenticate, requireCashier, requireManager } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireCashier);

router.get('/dashboard', getDashboard);
router.get('/summary', getReportSummary);
router.get('/sales-summary', getSalesSummary);
router.get('/eod', getEODReport);
router.get('/staff-performance', requireManager, getStaffPerformance);
router.get('/download/excel', requireManager, downloadExcel);

export default router;
