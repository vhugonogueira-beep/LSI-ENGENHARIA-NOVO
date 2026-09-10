import { Router } from 'express';
import multer from 'multer';
import { MasterController } from '../controllers/master.controller';

const router = Router();
const uploadLogo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } });

// Contratantes
router.get('/contratantes', MasterController.listContratantes);
router.post('/contratantes', MasterController.createContratante);
router.put('/contratantes/:id', MasterController.updateContratante);
router.post('/contratantes/:id/logo', uploadLogo.single('logo'), MasterController.uploadLogoContratante);
router.post('/contratantes-upsert', MasterController.upsertContratantePorNome);

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
