import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import authRoutes         from './routes/auth';
import marinasRoutes      from './routes/marinas';
import boatsRoutes        from './routes/boats';
import reservationsRoutes from './routes/reservations';
import paymentsRoutes     from './routes/payments';
import uploadsRoutes      from './routes/uploads';
import addonsRoutes       from './routes/addons';
import favoritesRoutes    from './routes/favorites';
import { errorHandler }   from './middleware/errorHandler';

const app  = express();
const PORT = process.env.PORT ?? 3001;

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://lake-pass-web.vercel.app',
  'https://lake-pass-dashboard.vercel.app',
];

const allowedOrigins = new Set([
  ...defaultAllowedOrigins,
  ...(process.env.ALLOWED_ORIGINS?.split(',') ?? []),
].map(origin => origin.trim()).filter(Boolean));

const allowedOriginPatterns = [
  /^https:\/\/lake-pass-web-[a-z0-9-]+\.vercel\.app$/,
  /^https:\/\/lake-pass-dashboard-[a-z0-9-]+\.vercel\.app$/,
];

const isAllowedOrigin = (origin: string) => (
  allowedOrigins.has(origin) || allowedOriginPatterns.some(pattern => pattern.test(origin))
);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
}));
app.use(morgan('dev'));

// Stripe webhook needs raw body — MUST be registered before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

const registerRoutes = (prefix = '') => {
  app.use(`${prefix}/auth`,         authRoutes);
  app.use(`${prefix}/marinas`,      marinasRoutes);
  app.use(`${prefix}/boats`,        boatsRoutes);
  app.use(`${prefix}/reservations`, reservationsRoutes);
  app.use(`${prefix}/payments`,     paymentsRoutes);
  app.use(`${prefix}/uploads`,      uploadsRoutes);
  app.use(`${prefix}/addons`,       addonsRoutes);
  app.use(`${prefix}/favorites`,    favoritesRoutes);
};

registerRoutes('/api');
registerRoutes();

app.use(errorHandler);

app.listen(PORT, () => console.log(`Lake Pass API on :${PORT}`));
export default app;
