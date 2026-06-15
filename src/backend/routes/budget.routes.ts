import { Router } from 'express';
import { BudgetController } from '../controllers/budget.controller';

const router = Router();

router.get('/', BudgetController.getAll);
router.post('/', BudgetController.create);
router.get('/:id', BudgetController.getById);
router.put('/:id/header', BudgetController.updateHeader);
router.put('/:id/items', BudgetController.updateItems);
router.post('/:id/versions', BudgetController.createVersion);
router.get('/:id/export/html', BudgetController.exportHtml);
router.get('/:id/export/excel', BudgetController.exportExcel);

export default router;
