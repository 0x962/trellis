ALTER TABLE "page_watches" DROP CONSTRAINT "page_watches_reservation_check";--> statement-breakpoint
ALTER TABLE "page_watches" ADD COLUMN "reservation_payload" jsonb;--> statement-breakpoint
ALTER TABLE "page_watches" ADD CONSTRAINT "page_watches_reservation_check" CHECK (("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_expires_at" IS NULL)
				AND ("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_end_at" IS NULL)
				AND ("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_end_id" IS NULL)
				AND ("page_watches"."reservation_id" IS NULL) = ("page_watches"."reservation_payload" IS NULL));