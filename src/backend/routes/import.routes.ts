import { Router } from 'express';
import multer from 'multer';
import { ImportController } from '../controllers/import.controller';
import { PriceBookController } from '../controllers/pricebook.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

const router = Router();

// Upload CSV/XLSX → parse → preview
router.post('/upload', upload.single('file'), ImportController.upload);

// Get import batch status/preview
router.get('/batches/:id', ImportController.getBatch);

// Confirm import → write PriceBookItems to DB
router.post('/batches/:id/confirm', ImportController.confirmBatch);

// PriceBookItem individual routes
router.put('/pricebook-items/:id', PriceBookController.updateItem);
router.delete('/pricebook-items/:id', PriceBookController.deleteItem);

export default router;
