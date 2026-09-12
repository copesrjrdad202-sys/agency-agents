import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import {
  createBusiness,
  updateBusiness,
  deleteBusiness,
  getBusinessById,
  listBusinesses,
} from '../services/businessStore';

/**
 * Admin API for managing multi-tenant business records:
 *  - list/create/update/delete businesses
 *  - map a Twilio number + system-prompt overrides to each business
 *
 * Protected by a single shared admin API key (ADMIN_API_KEY env var), sent as
 * either an `Authorization: Bearer <key>` header or `X-Admin-Key` header.
 * This is intentionally simple for an MVP; swap in real auth (per-operator
 * accounts, OAuth, etc.) before scaling beyond a single operator.
 */

const router = Router();

function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminApiKey) {
    res.status(500).json({ error: 'Server misconfigured: ADMIN_API_KEY is not set.' });
    return;
  }
  const header = req.header('Authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const provided = bearer || req.header('X-Admin-Key') || '';

  if (provided !== config.adminApiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.use(requireAdminKey);

router.get('/businesses', (_req: Request, res: Response) => {
  return res.json({ businesses: listBusinesses() });
});

router.get('/businesses/:id', (req: Request, res: Response) => {
  const business = getBusinessById(req.params.id);
  if (!business) return res.status(404).json({ error: 'Not found' });
  return res.json({ business });
});

router.post('/businesses', (req: Request, res: Response) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: '"name" is required.' });
  }
  const business = createBusiness(req.body);
  return res.status(201).json({ business });
});

router.patch('/businesses/:id', (req: Request, res: Response) => {
  const business = updateBusiness(req.params.id, req.body || {});
  if (!business) return res.status(404).json({ error: 'Not found' });
  return res.json({ business });
});

router.delete('/businesses/:id', (req: Request, res: Response) => {
  const removed = deleteBusiness(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Not found' });
  return res.status(204).send();
});

export default router;
