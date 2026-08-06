import 'dotenv/config';
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import marinasRoutes from './routes/marinas';
import boatsRoutes from './routes/boats';
import reservationsRoutes from './routes/reservations';
import paymentsRoutes from './routes/payments';
import uploadsRoutes from './routes/uploads';
import addonsRoutes from './routes/addons';
import favoritesRoutes from './routes/favorites';
import teamRoutes from './routes/team';
import maintenanceRoutes from './routes/maintenance';
import calendarRoutes from './routes/calender';
import weatherRoutes from './routes/weather';
import aiRoutes from './routes/ai';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────────────────────

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:8081',
  'https://lake-pass-web.vercel.app',
  'https://lake-pass-dashboard.vercel.app',
];

const environmentOrigins =
  process.env.ALLOWED_ORIGINS
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...environmentOrigins,
]);

const allowedOriginPatterns = [
  /^https:\/\/lake-pass-web-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/lake-pass-dashboard-[a-z0-9-]+\.vercel\.app$/,
];

function isAllowedOrigin(origin: string): boolean {
  return (
    allowedOrigins.has(origin) ||
    allowedOriginPatterns.some((pattern) => pattern.test(origin))
  );
}

// ── Security ─────────────────────────────────────────────────────────────────

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(`Origin ${origin} is not allowed by CORS`),
      );
    },
    credentials: true,
  }),
);

app.use(
  morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'),
);

// ── Rate limiting ─────────────────────────────────────────────────────────────

const skipRateLimit = (): boolean =>
  process.env.NODE_ENV === 'test';

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
  skip: skipRateLimit,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many auth requests, please try again later.',
  },
  skip: skipRateLimit,
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many payment requests, please try again later.',
  },
  skip: (req) =>
    process.env.NODE_ENV === 'test' ||
    req.path === '/webhook',
});

app.use(globalLimiter);

// ── Stripe webhook ────────────────────────────────────────────────────────────

// Stripe needs the original request bytes for signature verification.
// This must appear before express.json().
app.use(
  '/api/payments/webhook',
  express.raw({
    type: 'application/json',
    limit: '1mb',
  }),
);

app.use(
  express.json({
    limit: '2mb',
  }),
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '2mb',
  }),
);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'lake-pass-api',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/marinas', marinasRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/boats', boatsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/payments', paymentLimiter, paymentsRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/addons', addonsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/ai', aiRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
  });
});

// Must be the final middleware.
app.use(errorHandler);

export default app;
