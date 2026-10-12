# six-seven market

six-seven market is a responsive storefront for clothing, accessories, gaming gear, and home audio. The existing React/Vite storefront now uses an Express API backed by MongoDB through Mongoose.

## Features

- Editorial home page, featured offers, product catalog, categories, three-character trigram search across product names/descriptions/categories/codes, price/category filters, sorting, and product details.
- Product gallery, color and size selection, size guide, quantity controls, and persistent basket.
- Featured rows support mouse dragging, touch gestures, and arrow-key scrolling with hidden scrollbars.
- Database-backed accounts, sign-in/registration, editable profile, and server-authorized admin tools.
- Admin product creation with validated JPEG, PNG, and WebP uploads, inventory entry, and stock updates.
- Stock-aware catalog and persistent order history. Out-of-stock products cannot be added to a basket; inventory is reserved when an order is confirmed.
- Checkout captures legal name, phone, and email, requests a server-generated stock/price quote, then requires explicit customer confirmation before order creation.
- Responsive styling, keyboard focus states, accessible labels, and interaction feedback.

## Stack and requirements

- Node.js 22+ and pnpm via Corepack
- React 19, TypeScript, Vite 8, Tailwind CSS 4
- Node.js/Express API and Mongoose
- MongoDB Atlas or a reachable MongoDB instance (MongoDB 6+ recommended)

## Install and configure

From the project root in PowerShell:

```powershell
corepack pnpm install
Copy-Item .env.example backend\.env
```

Edit `backend\.env`:

- `MONGODB_URI`: Atlas connection string or a MongoDB URI such as `mongodb://127.0.0.1:27017/six_seven_market`. URL-encode special characters in Atlas usernames/passwords. In Atlas, add the machine's IP to Network Access and grant the database user read/write access to the target database.
- `SESSION_SECRET`: replace the example with a cryptographically random secret of at least 32 characters. Generate one with:

  ```powershell
  node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
  ```

- `INITIAL_LOGIN_PASSWORD`: the initial `user` and `admin` seed accounts share this password. Use a strong value for any non-disposable environment.
- `FRONTEND_ORIGINS`: exact comma-separated frontend origins. The template includes the default local Vite origins. For a separately deployed frontend, set this to its full origin, such as `https://your-store.onrender.com` (no trailing slash).
- `PORT`: API port (default `3001`).
- `UPLOAD_DIR`: product-image directory relative to `backend` unless an absolute path is supplied (default `uploads`).

The backend reads settings from **`backend/.env`**. Keep it private: `.env` files are ignored by Git. Never put database credentials or session secrets in frontend code or commit them.

Locally uploaded product images are stored in `backend/uploads/` and excluded from Git. Back them up separately or configure persistent/object storage before deploying; do not commit customer or product-upload files.

For separate frontend and backend services, configure the frontend service's build-time environment variable `VITE_API_URL` to the backend's public origin, for example `https://your-api.onrender.com` (no trailing slash). Set `FRONTEND_ORIGINS` on the backend to the frontend's exact origin. The browser API uses credentialed cross-origin requests for session cookies; production cookies require HTTPS. Prefer frontend and API hostnames under the same site/domain because browsers may block cookies in cross-site contexts.

## Create database indexes and initial data

```powershell
corepack pnpm db:setup
corepack pnpm db:seed
corepack pnpm db:seed:products
```

`db:setup` connects to the configured MongoDB database and initializes Mongoose models/indexes. Existing products without a stock field are migrated to zero available stock; an administrator can then enter inventory for each item. `db:seed` idempotently creates or updates `user` and `admin` with the shared configured password and their expected roles, and adds any missing sample products across the clothing, accessories, gaming, and home-audio categories. `db:seed:products` adds only missing sample products and does not modify account passwords. Both seed commands include starter inventory and illustrative product photos hosted by Unsplash; existing orders, products, and product inventory are preserved. The full `db:seed` command resets the two initial account passwords to `INITIAL_LOGIN_PASSWORD`. The product-only command requires an existing admin account.

Public registration creates only `user` accounts. Administrator access is assigned by the seed or directly by a trusted database administrator; the API never accepts a role from the browser.

## Run and test

Run API and frontend together:

```powershell
corepack pnpm dev
```

The API listens on `127.0.0.1:3001`; Vite serves the existing app at port `8443` and proxies `/api` and `/uploads` to the API. Check API/database/index availability:

If Vite is already running on port `8443` (for example, in the Figma Make preview), do not start a second Vite server with `corepack pnpm dev`. Start only the API with `corepack pnpm dev:api`; the existing frontend can continue using it.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Expected response when MongoDB and model indexes are ready:

```json
{ "status": "ok", "database": "connected" }
```

Useful commands:

```powershell
corepack pnpm dev:api
corepack pnpm start:api
corepack pnpm db:setup
corepack pnpm db:seed
corepack pnpm build
corepack pnpm test:backend
```

The health route returns HTTP 503 with the current connection status if MongoDB or model-index initialization is unavailable. The API logs connection/index errors; after correcting an invalid URI or Atlas access settings, restart the API.

## API overview

- `GET /api/health` — API database/index readiness.
- `GET /api/auth/csrf`, `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `PATCH /api/auth/profile` — authentication/session/profile.
- `GET /api/products`, `GET /api/products/:id`, `GET /api/categories` — public MongoDB-backed catalog and category list.
- `POST /api/products`, `PATCH /api/products/:id/stock`, `GET /api/products/admin/list` — administrator-only product/inventory operations.
- `GET /api/orders/my`, `GET /api/orders/:id`, `POST /api/orders/quote`, `POST /api/orders` — authenticated, user-scoped order review, lookup, and creation.
- `GET /api/orders/admin` — administrator-only order listing.

Authentication uses a signed, HttpOnly session cookie, CSRF checks for writes, bcrypt password hashes, and a role loaded from the database on every authenticated request. Product codes are generated on the server using the existing specified formula; a unique MongoDB index plus bounded duplicate-key retries handle concurrent collisions.

API errors use a consistent JSON `{ "error": "..." }` body and suitable HTTP statuses (including 400 for invalid input, 401/403 for authentication/authorization, 404 for missing records, and 409 for stale prices or stock).

## Checkout review and inventory

Checkout has three server-verified steps: the frontend requests a quote containing the cart and required legal name/phone/email; the backend validates current prices, variants, and available stock and returns a short-lived, signed quote; after the customer explicitly confirms or chooses to continue shopping, final order submission verifies that quote and rechecks the live price and stock. A stale quote is rejected with HTTP 409 so the customer can review the updated total again. The server computes all line totals, shipping, and order totals; it never trusts prices from the browser.

Order creation atomically decrements each product's inventory and inserts the order in a MongoDB transaction. This requires MongoDB transaction support (Atlas clusters provide replica-set transactions). A standalone local MongoDB server cannot safely process stock-reserving orders; use Atlas or configure a local replica set for checkout testing. If a transaction cannot run, the API returns an explicit 503 error rather than accepting an order without reserving inventory. Products without migrated stock have zero availability until an administrator sets inventory. A user can only read their own order history; an administrator can read all orders.

Orders record intent only; no payment is processed.

## Project structure

```text
.
├── backend/
│   ├── auth/                    # Account operations and tests
│   ├── models/                  # Mongoose User, Product, and Order schemas
│   ├── routes/                  # Auth, product, and order API routes
│   ├── scripts/                 # MongoDB index setup and seed
│   ├── server.js                # Express API and health endpoint
│   └── uploads.js               # Image validation/storage
├── src/
│   ├── App.tsx                  # Existing storefront pages and UI
│   ├── api.ts                   # Typed frontend API client
│   ├── index.css                # Design tokens and responsive styles
│   └── main.tsx                 # React entry point
├── .env.example                 # Safe configuration template
└── package.json
```

The existing MySQL database is not automatically migrated. Configure a MongoDB database, run the seed command, and create/import any additional catalog data as needed. Product uploads are stored on the API host filesystem; use a persistent volume or object storage when deploying.
