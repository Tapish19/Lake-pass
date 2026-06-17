import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMarinaStaff, AuthRequest } from '../middleware/auth';
import { getUploadUrl, UploadCategory } from '../lib/s3';
import { AppError } from '../middleware/errorHandler';

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
 *
 * boat-photos is marina-staff only. licenses/insurance are consumer-only.
 */
router.post('/presign', requireAuth, async (req: AuthRequest, res) => {
  const { category, mimeType } = UploadSchema.parse(req.body);

  // Enforce who can upload to each category.
  if (category === 'boat-photos') {
    if (!req.marinaId) throw new AppError(403, 'Only marina staff can upload boat photos');
  } else {
    // licenses and insurance — consumer accounts only.
    if (!req.userId) throw new AppError(403, 'Consumer account required for document uploads');
  }

  const allowed = ALLOWED_MIME[category];
  if (!allowed.includes(mimeType)) {
    return res.status(400).json({ error: `${mimeType} is not allowed for ${category}. Allowed: ${allowed.join(', ')}` });
  }

  const result = await getUploadUrl(category, mimeType);
  res.json(result);
});

export default router;
