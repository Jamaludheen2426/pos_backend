import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '../lib/jwt';

export const initSocketServer = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

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
    const user = (socket as unknown as Record<string, unknown>).user as { companyId: number };

    // Join company room for isolated stock updates
    socket.join(`company:${user.companyId}`);

    socket.on('disconnect', () => {
      socket.leave(`company:${user.companyId}`);
    });
  });

  return io;
};

// Call this after a sale to push real-time stock update
export const emitStockUpdate = (io: Server, companyId: number, data: unknown): void => {
  io.to(`company:${companyId}`).emit('stock:updated', data);
};
