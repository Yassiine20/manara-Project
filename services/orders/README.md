# Orders service

Small Express service for authenticated order creation and retrieval.

## API

- `POST /api/orders` creates an order from `items`.
- `GET /api/orders` lists the current user's newest 100 orders.
- `GET /api/orders/:id` returns one owned order.
- `GET /health` returns service health.

Example order body:

```json
{
  "items": [
    { "productId": "product-1", "quantity": 2, "unitPriceCents": 1500 }
  ]
}
```

All order endpoints require `Authorization: Bearer <auth-token>`. Orders must use the same `JWT_SECRET` and Redis instance as Auth.

## Run

```bash
cp .env.example .env
npm install
npm run db:deploy
set -a; source .env; set +a
npm run dev
```

Set `NOTIFICATIONS_SERVICE_URL` and `INTERNAL_API_KEY` together to enable the optional order-created notification call. Leave both empty until Notifications is available.
