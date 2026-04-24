# POS Backend API

> SaaS Point-of-Sale Platform — REST API + WebSocket Server

Node.js · Express · Prisma ORM · MySQL · Socket.IO · TypeScript

---

## What This Is

The central API server for the SaaS POS platform. It is **multi-tenant** — every table is scoped by `company_id`, so each client company's data is fully isolated from others. It serves both the **Client Web App** (port 3002) and the **Creator Panel** (port 3003).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express 4 |
| ORM | Prisma 5 |
| Database | MySQL |
| Auth | JWT (access + refresh tokens) |
| Real-time | Socket.IO |
| Validation | Zod |
| PDF Reports | PDFKit |
| Excel Reports | ExcelJS |
| Rate Limiting | express-rate-limit (200 req/min) |

---

## Project Structure

```
pos_backend/
├── prisma/
│   ├── schema.prisma       # Full database schema (multi-tenant)
│   └── seed.ts             # Demo data seeder
├── src/
│   ├── index.ts            # Express app entry point + HTTP server
│   ├── controllers/        # Business logic (15 controllers)
│   ├── routes/             # Route definitions → /api/v1/*
│   ├── middleware/
│   │   ├── auth.ts         # JWT guard middleware
│   │   └── companyScope.ts # Multi-tenant isolation middleware
│   ├── sockets/
│   │   └── stockSocket.ts  # Real-time stock update broadcaster
│   └── lib/
│       ├── jwt.ts          # Token sign/verify helpers
│       └── prisma.ts       # Prisma singleton client
```

---

## API Routes

All routes are prefixed `/api/v1/`

| Module | Prefix | Description |
|---|---|---|
| Auth | `/auth` | Login, logout, refresh token |
| Companies | `/companies` | CRUD for client companies |
| Plans | `/plans` | Subscription plan management |
| Stores | `/stores` | Multi-store per company |
| Users | `/users` | OWNER / MANAGER / CASHIER roles |
| Subscriptions | `/subscriptions` | Plan billing, Razorpay sub ID |
| Products | `/products` | Products + variants + barcode |
| Sales | `/sales` | POS transactions + offline sync |
| Reports | `/reports` | Revenue, EOD, stock reports |
| Customers | `/customers` | Customer profiles + loyalty points |
| Suppliers | `/suppliers` | Supplier contact management |
| Purchase Orders | `/purchase-orders` | PENDING / RECEIVED / CANCELLED |
| Tax Rates | `/tax-rates` | GST slabs per company |
| Discount Rules | `/discount-rules` | FLAT / PERCENTAGE discounts |
| Stock Management | `/stock-management` | Adjustments, transfers, movements |

Health check: `GET /health`

---

## Database Models

### Multi-Tenant Core
- **Plan** — Basic / Pro / Enterprise with feature gates (stores, users, products, mobile, offline, reports)
- **Company** — Client business account with status (ACTIVE / SUSPENDED / EXPIRED)
- **CompanySettings** — Per-company module toggles: multi-store, offline mode, loyalty points, GST billing, expiry tracking, etc.
- **Subscription** — Billing record with start/end dates and Razorpay subscription ID

### Users & Auth
- **User** — Roles: `CREATOR` | `OWNER` | `MANAGER` | `CASHIER`
- **RefreshToken** — Per-platform (WEB / MOBILE) with expiry and revocation

### Inventory
- **Product** — Supports variants, weight-based selling, expiry tracking, barcode/SKU
- **ProductVariant** — Size / colour / price / barcode per variant
- **Stock** — Per-store stock quantity with configurable low-stock threshold
- **StockMovement** — Full audit log: PURCHASE / SALE / TRANSFER_IN / TRANSFER_OUT / ADJUSTMENT
- **StockTransfer** — Inter-store transfers

### Sales & Billing
- **Sale** — Receipt with subtotal, discount, tax, loyalty points used, offline sync timestamp
- **SaleItem** — Line items with qty, unit price, discount, tax, line total
- **Payment** — Split payments: CASH / CARD / UPI

### Supply Chain
- **Supplier** — Vendor contacts
- **PurchaseOrder** — PO with line items; lifecycle: PENDING → RECEIVED / CANCELLED

### CRM
- **Customer** — Profile with phone / email
- **LoyaltyPoints** — Points balance per customer

### Config
- **DiscountRule** — Code-based or automatic; flat or percentage; expiry date and usage cap
- **TaxRate** — GST slab rates per company (0%, 5%, 12%, 18%, 28%)

---

## User Roles

| Role | Description |
|---|---|
| `CREATOR` | Platform super-admin. No `company_id`. Manages all companies and plans via the Creator Panel. |
| `OWNER` | Business owner — full access within their company |
| `MANAGER` | Store manager — operational access |
| `CASHIER` | POS terminal — sales-only access |

---

## Real-Time (WebSocket)

Socket.IO runs on the same HTTP server. Clients authenticate via JWT on the socket handshake. Each connected user is placed in a `company:{id}` room, so stock updates are broadcast only to users of the relevant company.

```ts
// After a sale completes, broadcast to all clients of that company:
emitStockUpdate(io, companyId, stockData);
// Clients receive the 'stock:updated' event
```

---

## Setup

### 1. Environment

Copy `.env.example` to `.env` and update the values:

```env
DATABASE_URL="mysql://root:password@localhost:3306/pos_saas"
JWT_SECRET="your-super-secret-key-change-in-production"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_WEB_EXPIRES="15d"
JWT_REFRESH_MOBILE_EXPIRES="1y"
PORT=3001
NODE_ENV=development
CREATOR_SECRET="creator-panel-master-secret"
```

### 2. Install & Migrate

```bash
npm install
npx prisma migrate dev
npm run prisma:generate
```

### 3. Seed Demo Data

```bash
npm run prisma:seed
```

Creates: 3 plans · 1 demo company (ShopMart Retail) · 2 stores · 4 users · 25 products · 8 customers · 5 suppliers · ~100+ sales (past 30 days)

**Demo credentials:**

| Role | Email | Password |
|---|---|---|
| Creator Admin | admin@pos.dev | admin123 |
| Owner | owner@shopmart.com | admin123 |
| Manager | manager@shopmart.com | staff123 |
| Cashier | mike@shopmart.com | staff123 |

### 4. Run

```bash
# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

API available at: `http://localhost:3001/api/v1`

---

## Subscription Plans

| Feature | Basic | Pro | Enterprise |
|---|---|---|---|
| Max Stores | 1 | 5 | Unlimited |
| Max Users | 3 | 15 | Unlimited |
| Max Products | 500 | 5,000 | Unlimited |
| Mobile App | No | Yes | Yes |
| Offline Mode | No | Yes | Yes |
| Advanced Reports | No | Yes | Yes |

---

## Scripts

```bash
npm run dev            # Start with hot reload (ts-node-dev)
npm run build          # Compile TypeScript → dist/
npm start              # Run compiled production build
npm run prisma:migrate # Run database migrations
npm run prisma:studio  # Open Prisma Studio GUI
npm run prisma:seed    # Seed demo data
```
