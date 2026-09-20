import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { tickets } from "../schema.ts";
import { actorColumns, actorFk, at } from "./actors.ts";
import { epics } from "./epics.ts";

export const epicResources = pgTable(
	"epic_resources",
	{
		id: text().primaryKey(),
		epicId: text("epic_id")
			.notNull()
			.references(() => epics.id, { onDelete: "cascade" }),
		kind: text().notNull(),
		name: text().notNull(),
		body: text(),
		url: text(),
		blobSha256: text("blob_sha256"),
		blobSize: bigint("blob_size", { mode: "number" }),
		mime: text(),
		ticketId: text("ticket_id").references(() => tickets.id, { onDelete: "set null" }),
		...actorColumns(),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		actorFk("epic_resources_actor_fk", t),
		check("epic_resources_kind_check", sql`${t.kind} IN ('doc', 'link', 'image', 'file')`),
		check("epic_resources_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 255`),
		check("epic_resources_body_check", sql`${t.body} IS NULL OR length(${t.body}) <= 200000`),
		check("epic_resources_url_check", sql`${t.url} IS NULL OR length(${t.url}) BETWEEN 1 AND 10000`),
		check("epic_resources_blob_sha256_check", sql`${t.blobSha256} IS NULL OR ${t.blobSha256} ~ '^[0-9a-f]{64}$'`),
		check("epic_resources_blob_size_check", sql`${t.blobSize} IS NULL OR ${t.blobSize} > 0`),
		check(
			"epic_resources_value_check",
			sql`(${t.kind} = 'doc' AND ${t.body} IS NOT NULL AND ${t.url} IS NULL AND ${t.blobSha256} IS NULL AND ${t.blobSize} IS NULL AND ${t.mime} IS NULL)
				OR (${t.kind} = 'link' AND ${t.body} IS NULL AND ${t.url} IS NOT NULL AND ${t.blobSha256} IS NULL AND ${t.blobSize} IS NULL AND ${t.mime} IS NULL)
				OR (${t.kind} IN ('image', 'file') AND ${t.body} IS NULL AND ${t.url} IS NULL AND ${t.blobSha256} IS NOT NULL AND ${t.blobSize} IS NOT NULL AND ${t.mime} IS NOT NULL)`,
		),
		index("epic_resources_epic_id_created_at_idx").on(t.epicId, t.createdAt),
		index("epic_resources_blob_sha256_idx")
			.on(t.blobSha256)
			.where(sql`${t.blobSha256} IS NOT NULL`),
		index("epic_resources_ticket_id_idx").on(t.ticketId),
	],
);
