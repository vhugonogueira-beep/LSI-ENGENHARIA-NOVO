import { Router } from 'express';
import { SupplierController } from '../controllers/supplier.controller';

const router = Router();

router.get('/', SupplierController.list);
router.get('/:id', SupplierController.getById);
router.post('/', SupplierController.create);
router.put('/:id', SupplierController.update);
router.delete('/:id', SupplierController.remove);

export default router;
