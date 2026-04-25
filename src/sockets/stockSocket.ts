import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../lib/jwt';
import { setIo } from '../lib/socket';
import logger from '../lib/logger';

export const initSocketServer = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // Register the singleton so controllers can emit without carrying io around
  setIo(io);

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const user = verifyToken(token);
      (socket as unknown as Record<string, unknown>).user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket as unknown as Record<string, unknown>).user as { companyId: number; userId: number };
    socket.join(`company:${user.companyId}`);
    logger.info({ userId: user.userId, companyId: user.companyId }, 'ws connected');

    socket.on('disconnect', () => {
      socket.leave(`company:${user.companyId}`);
    });
  });

  return io;
};
