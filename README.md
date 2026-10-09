# Manara ECS Microservices Project

Three small TypeScript/Express services designed for deployment on ECS Fargate.

## Structure

```text
services/
  auth/             TypeScript/Express authentication service
  orders/           TypeScript/Express orders service
  notifications/    TypeScript/Express notifications service
```

Each service contains its API contract and development commands in its own README. ECS should inject database URLs, Redis URLs, JWT secrets, and internal API keys at runtime.

## Local architecture

| Service | Port | PostgreSQL schema | Purpose |
| --- | ---: | --- | --- |
| Auth | 3001 | `auth` | Users and Redis-backed JWT sessions |
| Orders | 3002 | `orders` | Authenticated order creation and retrieval |
| Notifications | 3003 | `notifications` | Persisted order notifications |

All services use the `manara` PostgreSQL database. They share Redis and the same `JWT_SECRET`. Orders calls Notifications using `NOTIFICATIONS_SERVICE_URL` and a separate shared `INTERNAL_API_KEY`.

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

Generate two different secrets:

```bash
openssl rand -hex 32  # JWT_SECRET: use in all three services
openssl rand -hex 32  # INTERNAL_API_KEY: use in Orders and Notifications
```

Copy each service's `.env.example` to `.env`. Use these database URLs:

```env
# Auth
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=auth

# Orders
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=orders
NOTIFICATIONS_SERVICE_URL=http://localhost:3003

# Notifications
DATABASE_URL=postgresql://auth:auth@localhost:5432/manara?schema=notifications
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

- Inject database credentials, `JWT_SECRET`, and `INTERNAL_API_KEY` from Secrets Manager.
- Use the same Redis endpoint and JWT secret for all services.
- Set Orders' `NOTIFICATIONS_SERVICE_URL` to the Notifications Cloud Map DNS base URL.
- Route `/api/auth/*`, `/api/orders/*`, and `/api/notifications/*` through the ALB.
- Do not expose `/internal/*` through an ALB listener rule.
