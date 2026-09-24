import type { Provider, ProviderKind } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail } from "../../errors.ts";

export type RawProvider = {
	id: string;
	name: string;
	kind: ProviderKind;
	base_url: string;
	key_last4: string;
	enabled: boolean;
	models: string[];
	created_at: string;
	updated_at: string;
};

export const providerColumns = sql`p.id, p.name, p.kind, p.base_url,
	CASE WHEN length(p.api_key) >= 8 THEN right(p.api_key, 4) ELSE '' END AS key_last4,
	p.enabled, offered.models,
	${iso(sql`p.created_at`)} AS created_at, ${iso(sql`p.updated_at`)} AS updated_at`;

export const providerSelect = sql`SELECT ${providerColumns} FROM providers p
	CROSS JOIN LATERAL (
		SELECT COALESCE(array_agg(pm.model_id ORDER BY pm.model_id), ARRAY[]::text[]) AS models
		FROM provider_models pm WHERE pm.provider_id = p.id
	) offered`;

export const toProvider = (row: RawProvider): Provider => ({
	id: row.id,
	name: row.name,
	kind: row.kind,
	baseUrl: row.base_url,
	keyLast4: row.key_last4,
	enabled: row.enabled,
	models: row.models,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
});

export const providerById = async (tx: Tx, id: string): Promise<Provider> => {
	const [provider] = await rows<RawProvider>(tx, sql`${providerSelect} WHERE p.id = ${id}`);
	if (provider === undefined) throw fail("NOT_FOUND", { kind: "provider", ref: id });
	return toProvider(provider);
};
