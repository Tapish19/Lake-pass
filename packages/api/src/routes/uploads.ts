import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getUploadUrl, UploadCategory } from '../lib/s3';

const router = Router();

const ALLOWED_MIME: Record<UploadCategory, string[]> = {
  'boat-photos': ['image/jpeg', 'image/png', 'image/webp'],
  'licenses':    ['image/jpeg', 'image/png', 'application/pdf'],
  'insurance':   ['image/jpeg', 'image/png', 'application/pdf'],
};

const UploadSchema = z.object({
  category: z.enum(['boat-photos', 'licenses', 'insurance']),
  mimeType: z.string(),
});

/**
 * POST /api/uploads/presign
 * Returns a pre-signed S3 PUT URL and the eventual public URL.
 * Client uploads directly to S3, then stores the publicUrl.
 */
router.post('/presign', requireAuth, async (req: AuthRequest, res) => {
  const { category, mimeType } = UploadSchema.parse(req.body);

  const allowed = ALLOWED_MIME[category];
  if (!allowed.includes(mimeType)) {
    return res.status(400).json({ error: `${mimeType} is not allowed for ${category}. Allowed: ${allowed.join(', ')}` });
  }

  const result = await getUploadUrl(category, mimeType);
  res.json(result);
});

export default router;
