import { timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createClient } from "redis";
import { validate as isUuid } from "uuid";

const PORT = Number(process.env.PORT ?? 3003);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!DATABASE_URL || !REDIS_URL || !JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("DATABASE_URL, REDIS_URL, and the same 32+ character JWT_SECRET as Auth are required");
}
if (!INTERNAL_API_KEY || INTERNAL_API_KEY.length < 32) {
  throw new Error("A separate 32+ character INTERNAL_API_KEY is required");
}

const prisma = new PrismaClient();
const redis = createClient({ url: REDIS_URL });
const app = express();
app.use(express.json());

type AuthResponse = Response<unknown, { userId: string }>;
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

function authenticateInternal(request: Request, response: Response, next: NextFunction) {
  const supplied = request.header("x-internal-api-key");
  const suppliedBuffer = Buffer.from(supplied ?? "");
  const expectedBuffer = Buffer.from(INTERNAL_API_KEY!);

  if (
    suppliedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(suppliedBuffer, expectedBuffer)
  ) {
    response.status(401).json({ error: "Invalid internal API key" });
    return;
  }

  next();
}

app.post("/internal/notifications", authenticateInternal, async (request, response) => {
  const userId = request.body.userId;
  const type = request.body.type;
  const orderId = request.body.orderId;
  const totalCents = request.body.totalCents;

  if (
    typeof userId !== "string" ||
    !isUuid(userId) ||
    type !== "ORDER_CREATED" ||
    typeof orderId !== "string" ||
    !isUuid(orderId) ||
    !Number.isInteger(totalCents) ||
    totalCents < 0 ||
    totalCents > 2_147_483_647
  ) {
    response.status(400).json({ error: "Invalid notification payload" });
    return;
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      message: `Order ${orderId} was created successfully`,
      payload: { orderId, totalCents }
    }
  });

  console.log(JSON.stringify({
    event: "notification_created",
    notificationId: notification.id,
    userId,
    type
  }));
  response.status(201).json({ notification });
});

app.get("/api/notifications", authenticate, async (_request, response: AuthResponse) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: response.locals.userId },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  response.json({ notifications });
});

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

await Promise.all([prisma.$connect(), redis.connect()]);
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Notifications service listening on ${PORT}`);
});

async function shutdown() {
  server.close();
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
