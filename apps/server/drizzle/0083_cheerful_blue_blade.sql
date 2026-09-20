CREATE TABLE "ticket_deps" (
	"ticket_id" text NOT NULL,
	"depends_on_id" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "ticket_deps_pkey" PRIMARY KEY("ticket_id","depends_on_id"),
	CONSTRAINT "ticket_deps_not_self" CHECK ("ticket_deps"."ticket_id" <> "ticket_deps"."depends_on_id"),
	CONSTRAINT "ticket_deps_source_check" CHECK ("ticket_deps"."source" IN ('manual', 'parsed', 'derived'))
);
--> statement-breakpoint
ALTER TABLE "ticket_deps" ADD CONSTRAINT "ticket_deps_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_deps" ADD CONSTRAINT "ticket_deps_depends_on_id_tickets_id_fk" FOREIGN KEY ("depends_on_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_deps_depends_on_id_idx" ON "ticket_deps" USING btree ("depends_on_id");