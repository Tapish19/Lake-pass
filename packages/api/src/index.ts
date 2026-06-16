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

app.use(helmet());
app.use(cors({
  origin:      process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
}));
app.use(morgan('dev'));

// Stripe webhook needs raw body — MUST be registered before express.json()
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/auth',         authRoutes);
app.use('/api/marinas',      marinasRoutes);
app.use('/api/boats',        boatsRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/payments',     paymentsRoutes);
app.use('/api/uploads',      uploadsRoutes);
app.use('/api/addons',       addonsRoutes);
app.use('/api/favorites',    favoritesRoutes);

app.use(errorHandler);

app.listen(PORT, () => console.log(`Lake Pass API on :${PORT}`));
export default app;
