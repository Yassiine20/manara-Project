# Auth service

Small Express service for users and Redis-backed JWT sessions.

## API

### `POST /api/auth/register`

```json
{
  "email": "user@example.com",
  "password": "at-least-12-characters",
  "name": "Example User"
}
```

Creates a user and returns `{ user, token, expiresIn }`.

### `POST /api/auth/login`

Accepts `email` and `password`, then returns `{ user, token, expiresIn }`.

### `GET /api/auth/me`

Requires `Authorization: Bearer <token>` and returns the current user.

### `POST /api/auth/logout`

Requires a bearer token, deletes its Redis session, and returns `204 No Content`.

### Health endpoint

- `GET /health` is the ECS container liveness endpoint.

## Run

Copy `.env.example` to `.env`, provide local PostgreSQL and Redis instances, then run:

```bash
cp .env.example .env
npm install
set -a; source .env; set +a
npm run db:deploy
npm run dev
```

## ECS runtime configuration

Inject `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` from Secrets Manager. Never place production secrets in the image.
