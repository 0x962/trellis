import { randomUUID } from "node:crypto";
import { DEFAULT_PROJECT_MANAGER_CONFIG, HarnessSchema, type Session, type SessionCreateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { assertNativeWorkEnabled } from "../agentRuns/nativeControl.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { columns, type StoredRun } from "../agentRuns/queries.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import type { IoCtx } from "../support.ts";
import { createSessionRepository, sessionDirectoryNames } from "./directory.ts";
import { sessionColumns, sessionNames } from "./queries.ts";
import { friendlySessionName, sessionSlug, uniqueSessionName } from "./sessionName.ts";

// Creates the directory, the run, and the session row, then launches the
// agent with the prompt as its first message. The run has the kind
// `session`, no persona, no project, and no ticket. Its name and its
// instruction are the session name and the prompt, so the terminal, the
// usage report, and the run history show them.
export const prepareCreate = async (ctx: IoCtx, input: SessionCreateInput) => {
	const typed = input.name === undefined ? null : sessionSlug(input.name);
	if (typed === "") throw invalidInput("name", "Use at least one letter or digit in the name.");
	const taken = new Set([...(await sessionDirectoryNames(ctx.home)), ...(await ctx.newTx(sessionNames))]);
	const name = uniqueSessionName(typed ?? friendlySessionName(), taken);
	const harness = input.harness ?? HarnessSchema.parse({ preset: "claude" });
	await ctx.newTx(assertNativeWorkEnabled);
	const directory = await createSessionRepository(ctx.home, name);
	const reservation = await ctx.newTx(async (tx) => {
		await upsert(ctx.core, tx, ctx.actor);
		const selected = await selectAccount(tx, {
			accountId: input.accountId ?? null,
			config: { ...DEFAULT_PROJECT_MANAGER_CONFIG, directory, harness },
			useDefault: true,
		});
		const runId = ulid();
		const [run] = await rows<StoredRun>(
			tx,
			sql`INSERT INTO agent_runs (id, name, account_id, runtime, persona_id, persona_name, kind, instruction, project_id, project_path, ticket_id, ticket_identifier, workspace_id, session_id, created_at, updated_at)
			VALUES (${runId}, ${name}, ${selected.accountId}, 'native', NULL, ${name}, 'session', ${input.prompt}, NULL, '', NULL, NULL, ${directory}, ${selected.config.harness.preset === "custom" ? randomUUID() : null}, ${ctx.now()}, ${ctx.now()})
			RETURNING ${columns}`,
		);
		const attempt = await reserveAttempt(ctx.core, tx, { runId });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id = ${attempt.id} WHERE id = ${runId}`);
		const [session] = await rows<Session>(
			tx,
			sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
			VALUES (${ulid()}, ${name}, ${directory}, ${JSON.stringify(selected.config.harness)}::jsonb, ${runId}, ${ctx.now()}, ${ctx.now()})
			RETURNING ${sessionColumns}`,
		);
		return { session: session!, run: { ...run!, terminalId: attempt.id }, config: selected.config, attempt };
	});
	ctx.emit({ type: "sessions.changed", id: reservation.session.id });
	ctx.emit({ type: "agent-runs.changed", id: reservation.run.id });
	await startNative(ctx, {
		run: reservation.run,
		config: reservation.config,
		resume: false,
		context: "",
		attempt: reservation.attempt,
	});
	return { id: reservation.session.id };
};
