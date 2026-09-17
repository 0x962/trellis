import type { HarnessAccountCreate, HarnessAccountUpdate } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { executionEnvironment } from "../../executionEnvironment";
import type { IoCtx } from "../support.ts";
import { resolveHostDefault, writeHostDefault } from "./hostDefault.ts";
import { presentAccount } from "./presentation.ts";
import { provisionProfile } from "./profiles.ts";
import { type AccountRow, accountColumns, getAccount } from "./queries.ts";

const requirePerson = (ctx: IoCtx) => {
	if (ctx.actor.kind !== "human") throw invalidInput("actor", "A person manages the accounts in Settings.");
};
// The default flag of each row prints as hostDefault.ts resolves it, so
// the list agrees with the account a launch uses when the SuperSet pointer
// names another profile than the Trellis flag.
export const list = async (_ctx: IoCtx, tx: Tx, _input: Record<string, never>) => {
	const accounts = await rows<AccountRow>(
		tx,
		sql`SELECT ${accountColumns} FROM harness_accounts WHERE archived_at IS NULL ORDER BY harness,name,id`,
	);
	const env = await executionEnvironment();
	const defaults = new Set<string>();
	for (const harness of new Set(accounts.map((account) => account.harness))) {
		const resolved = await resolveHostDefault(harness, accounts, env);
		if (resolved.account) defaults.add(resolved.account.id);
	}
	return accounts.map((account) => presentAccount({ ...account, isDefault: defaults.has(account.id) }));
};
export const prepareCreate = async (ctx: IoCtx, input: HarnessAccountCreate) => {
	requirePerson(ctx);
	const id = ulid();
	const env = await executionEnvironment();
	return { ...input, id, profilePath: await provisionProfile(ctx.home, id, input, env) };
};
export const create = async (ctx: IoCtx, tx: Tx, input: HarnessAccountCreate & { id: string; profilePath: string }) => {
	requirePerson(ctx);
	const duplicates = await rows(
		tx,
		sql`SELECT id FROM harness_accounts WHERE harness=${input.harness} AND profile_path=${input.profilePath} AND archived_at IS NULL`,
	);
	if (duplicates.length) throw invalidInput("profilePath", "This profile already has an account entry.");
	const [account] = await rows<AccountRow>(
		tx,
		sql`INSERT INTO harness_accounts (id,name,harness,profile_path,created_at,updated_at) VALUES (${input.id},${input.name},${input.harness},${input.profilePath},${ctx.now()},${ctx.now()}) RETURNING ${accountColumns}`,
	);
	return presentAccount(account!);
};
export const update = async (ctx: IoCtx, tx: Tx, input: HarnessAccountUpdate) => {
	requirePerson(ctx);
	await tx.execute(sql`LOCK TABLE harness_accounts IN ROW EXCLUSIVE MODE`);
	const account = await getAccount(tx, input);
	const enabled = input.enabled ?? account.enabled;
	const isDefault = input.isDefault ?? account.isDefault;
	if (isDefault && !enabled) throw invalidInput("enabled", "Clear the default before you disable this account.");
	if (isDefault)
		await tx.execute(
			sql`UPDATE harness_accounts SET is_default=false,updated_at=${ctx.now()} WHERE harness=${account.harness} AND is_default AND id<>${account.id}`,
		);
	const [updated] = await rows<AccountRow>(
		tx,
		sql`UPDATE harness_accounts SET name=${input.name ?? account.name},enabled=${enabled},is_default=${isDefault},updated_at=${ctx.now()} WHERE id=${account.id} RETURNING ${accountColumns}`,
	);
	// A default picked here reaches every other tool on the machine through
	// the SuperSet pointer, once the transaction holds.
	if (input.isDefault === true)
		ctx.afterCommit(async () => writeHostDefault(account.harness, account.profilePath, await executionEnvironment()));
	return presentAccount(updated!);
};
export const remove = async (ctx: IoCtx, tx: Tx, input: { id: string }) => {
	requirePerson(ctx);
	await getAccount(tx, input);
	const active = await rows(
		tx,
		sql`SELECT id FROM agent_runs WHERE account_id=${input.id} AND closed_at IS NULL LIMIT 1`,
	);
	if (active.length) throw invalidInput("id", "Stop the agents that use this account before you remove it.");
	await tx.execute(
		sql`UPDATE harness_accounts SET archived_at=${ctx.now()},is_default=false,enabled=false,updated_at=${ctx.now()} WHERE id=${input.id}`,
	);
	return input;
};
