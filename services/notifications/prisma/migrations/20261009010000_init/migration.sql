CREATE SCHEMA IF NOT EXISTS "notifications";

CREATE TYPE "notifications"."NotificationType" AS ENUM ('ORDER_CREATED');

CREATE TABLE "notifications"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notifications"."NotificationType" NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_created_at_idx"
ON "notifications"."notifications"("user_id", "created_at");
