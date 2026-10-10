CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "roles_name_check" CHECK ("roles"."name" = btrim("roles"."name") AND length("roles"."name") >= 1)
);
