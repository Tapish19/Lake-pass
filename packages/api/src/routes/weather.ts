import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getCurrentWeather } from '../lib/weather';
 
const router = Router();
 
// ── GET /weather?lat=&lon= — current conditions at a marina/boat location ──
// Public (no auth) so it can be called from the consumer trip view and the
// marina widget alike; OPENWEATHER_API_KEY stays server-side either way.
router.get('/', async (req, res) => {
  const { lat, lon } = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lon: z.coerce.number().min(-180).max(180),
  }).parse(req.query);
 
  const weather = await getCurrentWeather(lat, lon);
  if (!weather) throw new AppError(503, 'Weather service unavailable (missing OPENWEATHER_API_KEY or upstream error)');
  res.json(weather);
});
 
export default router;
 
