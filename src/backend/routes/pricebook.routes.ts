import { Router } from 'express';
import { PriceBookController } from '../controllers/pricebook.controller';

const router = Router();

// Migração de mão única das LPUs que viviam no localStorage do navegador.
router.post('/importar-locais', PriceBookController.importarLocais);

// PriceBook CRUD
router.get('/', PriceBookController.list);
router.get('/lookup-price', PriceBookController.lookupPrice);
router.get('/:id', PriceBookController.getById);
router.post('/', PriceBookController.create);
router.put('/:id', PriceBookController.update);
// excluir a base inteira — arquiva se algum orçamento ainda depende dela
router.delete('/:id', PriceBookController.remove);

// PriceBook Items
router.get('/:id/items', PriceBookController.listItems);
// relatório de códigos repetidos — sinaliza, nunca funde nem sobrescreve
router.get('/:id/duplicidades', PriceBookController.duplicidades);
router.post('/:id/items', PriceBookController.createItem);
// editar / remover item — rotas de dois segmentos, por isso não colidem com '/:id'
router.put('/items/:id', PriceBookController.updateItem);
router.delete('/items/:id', PriceBookController.deleteItem);

export default router;
