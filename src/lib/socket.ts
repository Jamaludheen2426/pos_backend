import { Server } from 'socket.io';

// Module-level singleton set once at startup — safe to import anywhere
let _io: Server | null = null;

export function setIo(io: Server): void {
  _io = io;
}

export function getIo(): Server {
  if (!_io) throw new Error('Socket.IO server not initialized');
  return _io;
}

// ─── Typed emit helpers ───────────────────────────────────────────────────────

export function emitToCompany(companyId: number, event: string, data: unknown): void {
  if (!_io) return; // graceful no-op if called before init (e.g. tests)
  _io.to(`company:${companyId}`).emit(event, data);
}

export interface StockUpdatePayload {
  productId: number;
  storeId: number;
  newQty: number;
  delta: number;       // negative for sales/transfers-out, positive for adjustments/transfers-in
  trigger: 'sale' | 'adjustment' | 'transfer' | 'purchase';
}

export interface LowStockAlert {
  productId: number;
  productName: string;
  storeId: number;
  storeName?: string;
  currentQty: number;
  lowStockAt: number;
}

export function emitStockUpdate(companyId: number, payload: StockUpdatePayload): void {
  emitToCompany(companyId, 'stock:updated', payload);
}

export function emitLowStockAlert(companyId: number, alerts: LowStockAlert[]): void {
  emitToCompany(companyId, 'stock:low', alerts);
}
