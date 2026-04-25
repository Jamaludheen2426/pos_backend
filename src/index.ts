import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import router from './routes';
import { initSocketServer } from './sockets/stockSocket';
import logger from './lib/logger';

const app = express();
const httpServer = createServer(app);

// WebSocket server (also registers the io singleton via setIo)
initSocketServer(httpServer);

// Structured request logging
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

app.use(cors({
  origin: (origin, callback) => callback(null, origin || '*'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true }));

// Routes
app.use('/api/v1', router);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// Must have 4 params so Express recognises it as an error middleware
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { statusCode?: number })?.statusCode ?? 500;
  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';

  logger.error(
    { err, method: req.method, url: req.url, companyId: (req as unknown as Record<string, unknown>)?.companyId },
    'unhandled error',
  );

  // Never leak stack traces to clients in production
  res.status(status).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && err instanceof Error
      ? { stack: err.stack }
      : {}),
  });
});

const PORT = process.env.PORT || 4001;
httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'POS Backend started');
});
