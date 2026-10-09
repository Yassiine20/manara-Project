# Notifications service

Small Express service that persists and logs order notifications.

## API

- `POST /internal/notifications` creates a notification using `x-internal-api-key`.
- `GET /api/notifications` lists the authenticated user's newest 100 notifications.
- `GET /health` returns service health.

The internal endpoint accepts:

```json
{
  "userId": "user-uuid",
  "type": "ORDER_CREATED",
  "orderId": "order-uuid",
  "totalCents": 3000
}
```

## Run

```bash
cp .env.example .env
npm install
npm run db:deploy
set -a; source .env; set +a
npm run dev
```

Use the same `JWT_SECRET` and Redis instance as Auth. Use a separate `INTERNAL_API_KEY`, then configure that same key and `NOTIFICATIONS_SERVICE_URL=http://localhost:3003` in Orders.
