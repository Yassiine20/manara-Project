import { PrismaClient } from "@prisma/client";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createClient } from "redis";
import { validate as isUuid } from "uuid";

const PORT = Number(process.env.PORT ?? 3002);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!DATABASE_URL || !REDIS_URL || !JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("DATABASE_URL, REDIS_URL, and the same 32+ character JWT_SECRET as Auth are required");
}
if (Boolean(NOTIFICATIONS_URL) !== Boolean(INTERNAL_API_KEY)) {
  throw new Error("NOTIFICATIONS_SERVICE_URL and INTERNAL_API_KEY must be configured together");
}

const prisma = new PrismaClient();
const redis = createClient({ url: REDIS_URL });
const app = express();
app.use(express.json());

type AuthResponse = Response<unknown, { userId: string }>;
type OrderItemInput = { productId: string; quantity: number; unitPriceCents: number };
const sessionKey = (id: string) => `auth:session:${id}`;

async function authenticate(request: Request, response: AuthResponse, next: NextFunction) {
  try {
    const [type, token] = request.header("authorization")?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new Error();

    const payload = jwt.verify(token, JWT_SECRET!, {
      issuer: "manara-auth",
      audience: "manara-api"
    }) as JwtPayload;

    if (!payload.sub || typeof payload.sid !== "string") throw new Error();
    const activeUserId = await redis.get(sessionKey(payload.sid));
    if (activeUserId !== payload.sub) throw new Error();

    response.locals = { userId: payload.sub };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
  }
}

function parseItems(value: unknown): OrderItemInput[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;

  const items: OrderItemInput[] = [];
  for (const valueItem of value) {
    if (!valueItem || typeof valueItem !== "object") return null;
    const item = valueItem as Record<string, unknown>;
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = item.quantity;
    const unitPriceCents = item.unitPriceCents;

    if (
      !productId ||
      productId.length > 100 ||
      !Number.isInteger(quantity) ||
      Number(quantity) < 1 ||
      Number(quantity) > 1000 ||
      !Number.isInteger(unitPriceCents) ||
      Number(unitPriceCents) < 0 ||
      Number(unitPriceCents) > 10_000_000
    ) {
      return null;
    }

    items.push({
      productId,
      quantity: Number(quantity),
      unitPriceCents: Number(unitPriceCents)
    });
  }

  return items;
}

async function notifyOrderCreated(order: {
  id: string;
  userId: string;
  totalCents: number;
}): Promise<void> {
  if (!NOTIFICATIONS_URL || !INTERNAL_API_KEY) return;

  try {
    const response = await fetch(
      `${NOTIFICATIONS_URL.replace(/\/$/, "")}/internal/notifications`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-api-key": INTERNAL_API_KEY
        },
        body: JSON.stringify({
          userId: order.userId,
          type: "ORDER_CREATED",
          orderId: order.id,
          totalCents: order.totalCents
        }),
        signal: AbortSignal.timeout(3000)
      }
    );

    if (!response.ok) throw new Error(`Notifications returned HTTP ${response.status}`);
  } catch (error) {
    console.error("Could not create order notification", error);
  }
}

app.post("/api/orders", authenticate, async (request, response: AuthResponse) => {
  const items = parseItems(request.body.items);
  if (!items) {
    response.status(400).json({ error: "Provide 1-100 valid order items" });
    return;
  }

  const totalCents = items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0
  );
  if (!Number.isSafeInteger(totalCents) || totalCents > 2_147_483_647) {
    response.status(400).json({ error: "Order total is too large" });
    return;
  }

  const order = await prisma.order.create({
    data: {
      userId: response.locals.userId,
      totalCents,
      items: { create: items }
    },
    include: { items: true }
  });

  await notifyOrderCreated(order);
  response.status(201).json({ order });
});

app.get("/api/orders", authenticate, async (_request, response: AuthResponse) => {
  const orders = await prisma.order.findMany({
    where: { userId: response.locals.userId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  response.json({ orders });
});

app.get("/api/orders/:id", authenticate, async (request, response: AuthResponse) => {
  const rawId = request.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isUuid(id)) {
    response.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const order = await prisma.order.findFirst({
    where: { id, userId: response.locals.userId },
    include: { items: true }
  });
  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }
  response.json({ order });
});

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

await Promise.all([prisma.$connect(), redis.connect()]);
const server = app.listen(PORT, "0.0.0.0", () => console.log(`Orders service listening on ${PORT}`));

async function shutdown() {
  server.close();
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
