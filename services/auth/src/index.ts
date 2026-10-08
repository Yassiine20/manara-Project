import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createClient } from "redis";

const PORT = Number(process.env.PORT ?? 3001);
const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS ?? 3600);

if (!DATABASE_URL || !REDIS_URL || !JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("DATABASE_URL, REDIS_URL, and a 32+ character JWT_SECRET are required");
}

const prisma = new PrismaClient();
const redis = createClient({ url: REDIS_URL });
const app = express();
app.use(express.json());

type AuthResponse = Response<unknown, { userId: string; sessionId: string }>;
const sessionKey = (id: string) => `auth:session:${id}`;
const publicUser = (user: { id: string; email: string; name: string | null; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt
});

async function createSession(userId: string) {
  const sessionId = randomUUID();
  await redis.setEx(sessionKey(sessionId), SESSION_TTL, userId);
  const token = jwt.sign({ sid: sessionId }, JWT_SECRET!, {
    subject: userId,
    issuer: "manara-auth",
    audience: "manara-api",
    expiresIn: SESSION_TTL
  });
  return { token, expiresIn: SESSION_TTL };
}

async function authenticate(request: Request, response: AuthResponse, next: NextFunction) {
  try {
    const [type, token] = request.header("authorization")?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new Error();
    const payload = jwt.verify(token, JWT_SECRET!, {
      issuer: "manara-auth",
      audience: "manara-api"
    }) as JwtPayload;
    if (!payload.sub || typeof payload.sid !== "string") throw new Error();
    const userId = await redis.get(sessionKey(payload.sid));
    if (userId !== payload.sub) throw new Error();
    response.locals = { userId, sessionId: payload.sid };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired session" });
  }
}

app.post("/api/auth/register", async (request, response) => {
  const email = String(request.body.email ?? "").trim().toLowerCase();
  const password = String(request.body.password ?? "");
  const name = request.body.name ? String(request.body.name).trim() : null;
  if (!email.includes("@") || password.length < 12) {
    response.status(400).json({ error: "A valid email and 12+ character password are required" });
    return;
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    response.status(409).json({ error: "Email already registered" });
    return;
  }
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, 12) }
  });
  response.status(201).json({ user: publicUser(user), ...(await createSession(user.id)) });
});

app.post("/api/auth/login", async (request, response) => {
  const email = String(request.body.email ?? "").trim().toLowerCase();
  const password = String(request.body.password ?? "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    response.status(401).json({ error: "Invalid email or password" });
    return;
  }
  response.json({ user: publicUser(user), ...(await createSession(user.id)) });
});

app.get("/api/auth/me", authenticate, async (_request, response: AuthResponse) => {
  const user = await prisma.user.findUnique({ where: { id: response.locals.userId } });
  if (!user) return void response.status(404).json({ error: "User not found" });
  response.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", authenticate, async (_request, response: AuthResponse) => {
  await redis.del(sessionKey(response.locals.sessionId));
  response.status(204).send();
});

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

await Promise.all([prisma.$connect(), redis.connect()]);
const server = app.listen(PORT, "0.0.0.0", () => console.log(`Auth service listening on ${PORT}`));

async function shutdown() {
  server.close();
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
