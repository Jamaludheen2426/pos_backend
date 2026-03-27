import { Router } from 'express';
import {
  listProducts,
  getProductByBarcode,
  createProduct,
  updateProduct,
  deleteProduct,
  getStockLevels,
  bulkImportProducts,
} from '../controllers/products.controller';
import { authenticate, requireManager, requireCashier } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', requireCashier, listProducts);
router.get('/stock', requireCashier, getStockLevels);
router.get('/barcode/:barcode', requireCashier, getProductByBarcode);
router.post('/bulk-import', requireManager, bulkImportProducts);
router.post('/', requireManager, createProduct);
router.patch('/:id', requireManager, updateProduct);
router.delete('/:id', requireManager, deleteProduct);

export default router;
