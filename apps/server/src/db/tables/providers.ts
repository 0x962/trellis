import { sql } from "drizzle-orm";
import { boolean, check, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { checkIn, PROVIDER_KINDS } from "../enums.ts";
import { at } from "./actors.ts";

export const providers = pgTable(
	"providers",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		kind: text().notNull(),
		baseUrl: text("base_url").notNull(),
		apiKey: text("api_key").notNull(),
		enabled: boolean().notNull().default(true),
		createdAt: at("created_at").notNull(),
		updatedAt: at("updated_at").notNull(),
	},
	(t) => [
		check("providers_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) BETWEEN 1 AND 120`),
		checkIn(t.kind, PROVIDER_KINDS),
		check("providers_base_url_check", sql`length(${t.baseUrl}) BETWEEN 1 AND 2000`),
		check("providers_api_key_check", sql`length(${t.apiKey}) BETWEEN 1 AND 4000`),
		uniqueIndex("providers_name_idx").on(sql`lower(${t.name})`),
	],
);

export const providerModels = pgTable(
	"provider_models",
	{
		providerId: text("provider_id")
			.notNull()
			.references(() => providers.id, { onDelete: "cascade" }),
		modelId: text("model_id").notNull(),
	},
	(t) => [
		primaryKey({ name: "provider_models_pkey", columns: [t.providerId, t.modelId] }),
		check(
			"provider_models_model_id_check",
			sql`length(${t.modelId}) BETWEEN 1 AND 200 AND ${t.modelId} !~ '[[:space:][:cntrl:]]'`,
		),
	],
);
