CREATE TABLE "personas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"instruction" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "personas_name_check" CHECK (length("personas"."name") BETWEEN 1 AND 120 AND "personas"."name" ~ '[^[:space:]]'),
	CONSTRAINT "personas_instruction_check" CHECK (length("personas"."instruction") BETWEEN 1 AND 200000 AND "personas"."instruction" ~ '[^[:space:]]')
);
