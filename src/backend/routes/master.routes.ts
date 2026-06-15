import { Router } from 'express';
import { MasterController } from '../controllers/master.controller';

const router = Router();

// Contratantes
router.get('/contratantes', MasterController.listContratantes);
router.post('/contratantes', MasterController.createContratante);
router.put('/contratantes/:id', MasterController.updateContratante);

// Sites
router.get('/sites', MasterController.listSites);
router.post('/sites', MasterController.createSite);

// Catalog
router.get('/catalog-services', MasterController.listCatalog);
router.post('/catalog-services', MasterController.createCatalogItem);
router.get('/price-engine/suggest', MasterController.suggestPrice);

// Templates
router.get('/templates', MasterController.listTemplates);
router.get('/templates/:id', MasterController.getTemplate);
router.post('/templates', MasterController.createTemplate);

export default router;
