import { Router } from 'express';
import { listarMunicipios, listarUfs } from '../services/localidades.service';

// Base IBGE de referência — leitura pública, como as demais listas de apoio.
const router = Router();

router.get('/ufs', (_req, res) => res.json(listarUfs()));
router.get('/municipios', (req, res) => res.json(listarMunicipios(req.query.uf, req.query.q)));

export default router;
