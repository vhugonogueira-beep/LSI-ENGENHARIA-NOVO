import { Router } from 'express';
import { PriceBookController } from '../controllers/pricebook.controller';

const router = Router();

// PriceBook CRUD
router.get('/', PriceBookController.list);
router.get('/lookup-price', PriceBookController.lookupPrice);
router.get('/:id', PriceBookController.getById);
router.post('/', PriceBookController.create);
router.put('/:id', PriceBookController.update);

// PriceBook Items
router.get('/:id/items', PriceBookController.listItems);
router.post('/:id/items', PriceBookController.createItem);

export default router;
