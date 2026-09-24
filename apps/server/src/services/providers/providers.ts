import {
	type Provider,
	ProviderCreateInputSchema,
	ProviderIdInputSchema,
	ProviderUpdateInputSchema,
} from "@trellis/api";
import { type SQL, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { fail, invalidInput } from "../../errors.ts";
import type { IoCtx } from "../support.ts";
import { invalidateProvider } from "./cache.ts";
import { providerById, providerSelect, type RawProvider, toProvider } from "./rows.ts";

const requirePerson = (ctx: IoCtx) => {
	if (ctx.actor.kind !== "human") throw invalidInput("actor", "Only a person can manage providers.");
};

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

const assertNameFree = async (tx: Tx, input: { id: string; name: string }) => {
	const duplicate = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM providers WHERE lower(name) = lower(${input.name}) AND id <> ${input.id} LIMIT 1`,
	);
	if (duplicate.length > 0) throw fail("DUPLICATE", { field: "name" }, "A provider with this name exists.");
};

const replaceModels = async (tx: Tx, providerId: string, models: string[]) => {
	await tx.execute(sql`DELETE FROM provider_models WHERE provider_id = ${providerId}`);
	if (models.length > 0)
		await tx.execute(
			sql`INSERT INTO provider_models (provider_id, model_id)
				SELECT ${providerId}, offered.model_id FROM unnest(${textArray(models)}) AS offered(model_id)`,
		);
};

export const list = async (_ctx: IoCtx, tx: Tx, _input: Record<string, never>): Promise<Provider[]> => {
	const found = await rows<RawProvider>(tx, sql`${providerSelect} ORDER BY lower(p.name), p.name, p.id`);
	return found.map(toProvider);
};

export const get = async (_ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Provider> => {
	const input = ProviderIdInputSchema.parse(rawInput);
	return providerById(tx, input.id);
};

export const create = async (ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Provider> => {
	const input = ProviderCreateInputSchema.parse(rawInput);
	requirePerson(ctx);
	await tx.execute(sql`LOCK TABLE providers IN SHARE ROW EXCLUSIVE MODE`);
	const id = ulid();
	await assertNameFree(tx, { id, name: input.name });
	await tx.execute(sql`INSERT INTO providers (id, name, kind, base_url, api_key, enabled, created_at, updated_at)
		VALUES (${id}, ${input.name}, ${input.kind}, ${normalizeBaseUrl(input.baseUrl)}, ${input.apiKey}, ${input.enabled}, ${ctx.now()}, ${ctx.now()})`);
	await replaceModels(tx, id, input.models);
	ctx.emit({ type: "providers.changed", id });
	return providerById(tx, id);
};

export const update = async (ctx: IoCtx, tx: Tx, rawInput: unknown): Promise<Provider> => {
	const input = ProviderUpdateInputSchema.parse(rawInput);
	requirePerson(ctx);
	await tx.execute(sql`LOCK TABLE providers IN SHARE ROW EXCLUSIVE MODE`);
	const existing = await providerById(tx, input.id);
	if (input.name !== undefined) await assertNameFree(tx, { id: existing.id, name: input.name });
	const sets: SQL[] = [];
	if (input.name !== undefined) sets.push(sql`name = ${input.name}`);
	if (input.baseUrl !== undefined) sets.push(sql`base_url = ${normalizeBaseUrl(input.baseUrl)}`);
	if (input.apiKey !== undefined) sets.push(sql`api_key = ${input.apiKey}`);
	if (input.enabled !== undefined) sets.push(sql`enabled = ${input.enabled}`);
	sets.push(sql`updated_at = ${ctx.now()}`);
	await tx.execute(sql`UPDATE providers SET ${sql.join(sets, sql`, `)} WHERE id = ${existing.id}`);
	if (input.models !== undefined) await replaceModels(tx, existing.id, input.models);
	ctx.afterCommit(async () => invalidateProvider(ctx.home, existing.id));
	ctx.emit({ type: "providers.changed", id: existing.id });
	return providerById(tx, existing.id);
};

export const remove = async (ctx: IoCtx, tx: Tx, rawInput: unknown) => {
	const input = ProviderIdInputSchema.parse(rawInput);
	requirePerson(ctx);
	await providerById(tx, input.id);
	await tx.execute(sql`DELETE FROM providers WHERE id = ${input.id}`);
	ctx.afterCommit(async () => invalidateProvider(ctx.home, input.id));
	ctx.emit({ type: "providers.changed", id: input.id });
	return input;
};
