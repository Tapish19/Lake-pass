import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes         from './routes/auth';
import marinasRoutes      from './routes/marinas';
import boatsRoutes        from './routes/boats';
import reservationsRoutes from './routes/reservations';
import paymentsRoutes     from './routes/payments';
import uploadsRoutes      from './routes/uploads';
import addonsRoutes       from './routes/addons';
import favoritesRoutes    from './routes/favorites';
import teamRoutes         from './routes/team';
import maintenanceRoutes  from './routes/maintenance';
import calendarRoutes     from './routes/calendar';
import weatherRoutes      from './routes/weather';
import { errorHandler }   from './middleware/errorHandler';
import { startReminderScheduler } from './lib/scheduler';

const app  = express();
const PORT = process.env.PORT ?? 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lake-pass-web.vercel.app',
  'https://lake-pass-dashboard.vercel.app',
];
const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
].map(o => o.trim()).filter(Boolean));
const allowedOriginPatterns = [
  /^https:\/\/lake-pass-web-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/lake-pass-dashboard-[a-z0-9-]+\.vercel\.app$/,
];
const isAllowedOrigin = (origin: string) =>
  allowedOrigins.has(origin) || allowedOriginPatterns.some(p => p.test(origin));

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(morgan('dev'));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Global limiter: 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limiter for auth endpoints: 20 per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later.' },
});

// Payment/onboarding endpoints: 30 per hour
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests, please try again later.' },
});

app.use(globalLimiter);

// Stripe webhook needs raw body — MUST be registered before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

const registerRoutes = (prefix = '') => {
  app.use(`${prefix}/auth`,         authLimiter,    authRoutes);
  app.use(`${prefix}/marinas`,                      marinasRoutes);
  app.use(`${prefix}/team`,                         teamRoutes);
  app.use(`${prefix}/boats`,                        boatsRoutes);
  app.use(`${prefix}/reservations`,                 reservationsRoutes);
  app.use(`${prefix}/payments`,     paymentLimiter, paymentsRoutes);
  app.use(`${prefix}/uploads`,                      uploadsRoutes);
  app.use(`${prefix}/addons`,                       addonsRoutes);
  app.use(`${prefix}/favorites`,                    favoritesRoutes);
  app.use(`${prefix}/maintenance`,                  maintenanceRoutes);
  app.use(`${prefix}/calendar`,                      calendarRoutes);
  app.use(`${prefix}/weather`,                       weatherRoutes);
};

registerRoutes('/api');
registerRoutes();

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Lake Pass API on :${PORT}`);
  // Start the reminder scheduler (sends 24h-before reminder emails/SMS)
  startReminderScheduler();
});

export default app;
