CREATE SCHEMA IF NOT EXISTS "orders";

CREATE TYPE "orders"."OrderStatus" AS ENUM ('CREATED');

CREATE TABLE "orders"."orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "orders"."OrderStatus" NOT NULL DEFAULT 'CREATED',
    "total_cents" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders"."order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "orders_user_id_created_at_idx" ON "orders"."orders"("user_id", "created_at");
CREATE INDEX "order_items_order_id_idx" ON "orders"."order_items"("order_id");

ALTER TABLE "orders"."order_items"
ADD CONSTRAINT "order_items_order_id_fkey"
FOREIGN KEY ("order_id") REFERENCES "orders"."orders"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
