import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text } from "drizzle-orm/pg-core";
import { checkIn, PROVIDER_KINDS } from "../enums.ts";
import { at } from "./actors.ts";

// The migration creates the hash indexes as equality exclusion constraints.
// PostgreSQL compares full values after a hash match, so different values can share a hash.
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
		check("providers_name_check", sql`${t.name} = btrim(${t.name}) AND length(${t.name}) >= 1`),
		checkIn(t.kind, PROVIDER_KINDS),
		check("providers_base_url_check", sql`length(${t.baseUrl}) >= 1`),
		check("providers_api_key_check", sql`length(${t.apiKey}) >= 1`),
		index("providers_name_equality").using("hash", sql`lower(${t.name})`),
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
		// The provider ID length separates the two values even when either value contains a colon.
		index("provider_models_identity_equality").using(
			"hash",
			sql`length(${t.providerId})::text || ':' || ${t.providerId} || ${t.modelId}`,
		),
		index("provider_models_provider_id_idx").on(t.providerId),
		check("provider_models_model_id_check", sql`length(${t.modelId}) >= 1 AND ${t.modelId} !~ '[[:space:][:cntrl:]]'`),
	],
);
