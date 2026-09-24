CREATE TABLE "provider_models" (
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	CONSTRAINT "provider_models_pkey" PRIMARY KEY("provider_id","model_id"),
	CONSTRAINT "provider_models_model_id_check" CHECK (length("provider_models"."model_id") BETWEEN 1 AND 200 AND "provider_models"."model_id" !~ '[[:space:][:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "providers_name_check" CHECK ("providers"."name" = btrim("providers"."name") AND length("providers"."name") BETWEEN 1 AND 120),
	CONSTRAINT "providers_kind_check" CHECK ("providers"."kind" IN ('vercel-ai-gateway', 'openai-compatible')),
	CONSTRAINT "providers_base_url_check" CHECK (length("providers"."base_url") BETWEEN 1 AND 2000),
	CONSTRAINT "providers_api_key_check" CHECK (length("providers"."api_key") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "provider_models" ADD CONSTRAINT "provider_models_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "providers_name_idx" ON "providers" USING btree (lower("name"));