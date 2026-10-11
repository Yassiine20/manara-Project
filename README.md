# Manara ECS Microservices Project

Three small TypeScript/Express services designed for deployment on ECS Fargate.

## Structure

```text
services/
  auth/             TypeScript/Express authentication service
  orders/           TypeScript/Express orders service
  notifications/    TypeScript/Express notifications service
```

Each service contains its API contract and development commands in its own README. ECS should inject database URLs, Redis URLs, Auth's private signing key, and the internal API key at runtime.

## Local architecture

| Service | Port | PostgreSQL schema | Purpose |
| --- | ---: | --- | --- |
| Auth | 3001 | `auth` | Users and Redis-backed JWT sessions |
| Orders | 3002 | `orders` | Authenticated order creation and retrieval |
| Notifications | 3003 | `notifications` | Persisted order notifications |

All services use the `manara` PostgreSQL database and share Redis. Auth signs RS256 user tokens with `JWT_PRIVATE_KEY`; all three services verify them with `JWT_PUBLIC_KEY` and check the Redis session. Orders calls Notifications using `NOTIFICATIONS_SERVICE_URL` and a separate `INTERNAL_API_KEY` shared only by those two services.

## Local dependencies

Start PostgreSQL and Redis if they are not already running:

```bash
docker run -d --name manara-postgres \
  -e POSTGRES_DB=manara \
  -e POSTGRES_USER=auth \
  -e POSTGRES_PASSWORD=auth \
  -p 5432:5432 postgres:17-alpine

docker run -d --name manara-redis \
  -p 6379:6379 redis:8-alpine
```

If those containers already exist:

```bash
docker start manara-postgres manara-redis
```

## Environment

Generate a 2048-bit RSA key pair and a separate internal API key:

```bash
mkdir -p local-keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out local-keys/jwt-private.pem
openssl pkey -in local-keys/jwt-private.pem -pubout -out local-keys/jwt-public.pem
openssl rand -hex 32  # INTERNAL_API_KEY: use in Orders and Notifications
```

Copy each service's `.env.example` to `.env`. Paste the full contents of `jwt-private.pem` into Auth's `JWT_PRIVATE_KEY` and the full contents of `jwt-public.pem` into each service's `JWT_PUBLIC_KEY`. Keep the PEM content between single quotes, including its BEGIN/END lines. The services also accept `\n` in place of PEM line breaks. The `local-keys` folder and `.env` files are ignored by Git.

Use these database URLs:

```env
# Auth
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=auth
JWT_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----
...paste private key lines...
-----END PRIVATE KEY-----'
JWT_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----
...paste public key lines...
-----END PUBLIC KEY-----'

# Orders
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=orders
JWT_PUBLIC_KEY='same public key as Auth'
NOTIFICATIONS_SERVICE_URL=http://localhost:3003
INTERNAL_API_KEY=same-generated-internal-key-as-Notifications

# Notifications
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=notifications
JWT_PUBLIC_KEY='same public key as Auth'
INTERNAL_API_KEY=same-generated-internal-key-as-Orders
```

Never put `/api/notifications` in `NOTIFICATIONS_SERVICE_URL`; Orders appends `/internal/notifications` itself.

## Install and migrate

Run inside each service directory:

```bash
npm install
npm run prisma:generate
set -a; source .env; set +a
npm run db:deploy
npm run build
```

## Start

Open one terminal per service and run from its directory:

```bash
set -a; source .env; set +a
npm start
```

Start Notifications, then Orders, then Auth. Health checks are available at `/health` on ports 3001, 3002, and 3003.

After switching from the old `JWT_SECRET` setup, log in again: existing HS256 tokens are no longer valid. Restart all three services with the matching public key before issuing new tokens.

## Test the flow

Log in through Auth and copy the returned token:

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  --data-raw '{"email":"user@example.com","password":"password12345"}'

TOKEN='PASTE_TOKEN_HERE'
```

Create an order:

```bash
curl -X POST http://localhost:3002/api/orders \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  --data-raw '{"items":[{"productId":"product-1","quantity":2,"unitPriceCents":1500}]}'
```

Read the generated notification:

```bash
curl http://localhost:3003/api/notifications \
  -H "Authorization: Bearer $TOKEN"
```

## AWS configuration

- Inject `JWT_PRIVATE_KEY` only into Auth and `INTERNAL_API_KEY` only into Orders and Notifications from Secrets Manager. Configure the same `JWT_PUBLIC_KEY` in all three services.
- Use the same Redis endpoint in all services.
- Set Orders' `NOTIFICATIONS_SERVICE_URL` to the Notifications Cloud Map DNS base URL.
- Route `/api/auth/*`, `/api/orders/*`, and `/api/notifications/*` through the ALB.
- Do not expose `/internal/*` through an ALB listener rule.
