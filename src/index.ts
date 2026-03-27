import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import router from './routes';
import { initSocketServer } from './sockets/stockSocket';

const app = express();
const httpServer = createServer(app);

// WebSocket server
initSocketServer(httpServer);

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true }));

// Routes
app.use('/api/v1', router);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`POS Backend → http://localhost:${PORT}/api/v1`);
});
