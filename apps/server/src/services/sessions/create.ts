import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { HarnessSchema, type Session, type SessionCreateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { upsert } from "../actors.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { launchColumns } from "../agentRuns/queries.ts";
import type { LaunchRun } from "../agentRuns/types.ts";
import { reserveAttempt } from "../assignments/attempts.ts";
import { recordRequest, replayRequest } from "../assignments/requests.ts";
import { selectAccount } from "../harnessAccounts/selectAccount.ts";
import type { IoCtx } from "../support.ts";
import { attachmentPrompt, prepareFiles } from "./attachments.ts";
import { createProjectSession } from "./createProject.ts";
import { createSessionRepository, sessionDirectoryNames } from "./directory.ts";
import { launchSession } from "./launchSession";
import { sessionColumns, sessionDirectoryLeaves } from "./queries.ts";
import { friendlySessionName, sessionSlug, uniqueDirectoryName } from "./sessionName.ts";

export const prepareCreate = async (ctx: IoCtx, input: SessionCreateInput, start: typeof startNative = startNative) => {
	const typed = input.name === undefined ? null : input.name.trim();
	if (typed === "") throw invalidInput("name", "Enter a name.");
	const files = await prepareFiles(ctx, input.files);
	const fingerprint = createHash("sha256")
		.update(
			JSON.stringify({
				name: input.name,
				prompt: input.prompt,
				harness: input.harness,
				accountId: input.accountId,
				files: files.map(({ name, sha }) => ({ name, sha })),
			}),
		)
		.digest("hex");
	if (input.project) return createProjectSession(ctx, input, typed ?? friendlySessionName(), fingerprint, files, start);
	const request = {
		requestId: input.requestId,
		target: { projectId: "", ticketId: null, newSession: true, sessionFingerprint: fingerprint },
	};
	const diskNames = await sessionDirectoryNames(ctx.home);
	const harness = input.harness ?? HarnessSchema.parse({ preset: "claude" });
	const reservation = await ctx.newTx(async (tx) => {
		const replay = await replayRequest(ctx.core, tx, request);
		if (replay) {
			const [session] = await rows<Session>(tx, sql`SELECT ${sessionColumns} FROM sessions WHERE run_id=${replay.id}`);
			if (!session) throw invalidInput("requestId", "This request created a deleted session. Use a new request ID.");
			return { replay: true as const, session };
		}
		const name = typed ?? friendlySessionName();
		// Two sessions may hold one name, so the folder name comes from the
		// name and takes a number when that folder is already there.
		const folder = uniqueDirectoryName(
			sessionSlug(name) || friendlySessionName(),
			new Set([...diskNames, ...(await sessionDirectoryLeaves(tx))]),
		);
		const directory = join(ctx.home, "sessions", folder);
		await upsert(ctx.core, tx, ctx.actor);
		const selected = await selectAccount(tx, {
			accountId: input.accountId ?? null,
			config: { directory, harness, accountId: null },
			useDefault: true,
		});
		const runId = ulid();
		const instruction = await attachmentPrompt(ctx.home, runId, input.prompt, files);
		const [run] = await rows<LaunchRun>(
			tx,
			sql`INSERT INTO agent_runs (id, name, account_id, runtime, harness, kind, instruction, project_id, project_key, ticket_id, ticket_identifier, workspace_id, session_id, created_at, updated_at)
			VALUES (${runId}, ${name}, ${selected.accountId}, 'native', ${JSON.stringify(selected.config.harness)}::jsonb, 'session', ${instruction}, NULL, '', NULL, NULL, ${directory}, ${selected.config.harness.preset === "custom" ? randomUUID() : null}, ${ctx.now()}, ${ctx.now()})
			RETURNING ${launchColumns}`,
		);
		const attempt = await reserveAttempt(ctx.core, tx, { runId });
		await tx.execute(sql`UPDATE agent_runs SET terminal_id = ${attempt.id} WHERE id = ${runId}`);
		const [session] = await rows<Session>(
			tx,
			sql`INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
			VALUES (${ulid()}, ${name}, ${directory}, ${JSON.stringify(selected.config.harness)}::jsonb, ${runId}, ${ctx.now()}, ${ctx.now()})
			RETURNING ${sessionColumns}`,
		);
		await recordRequest(ctx.core, tx, { ...request, runId });
		return {
			replay: false as const,
			session: session!,
			run: { ...run!, terminalId: attempt.id },
			config: selected.config,
			attempt,
		};
	});
	if (reservation.replay) return { id: reservation.session.id };
	launchSession(
		ctx,
		reservation.session.id,
		{
			run: reservation.run,
			config: reservation.config,
			resume: false,
			attempt: reservation.attempt,
		},
		start,
		() => createSessionRepository(reservation.session.directory),
	);
	ctx.emit({ type: "sessions.changed", id: reservation.session.id });
	ctx.emit({ type: "agent-runs.changed", id: reservation.run.id });
	return { id: reservation.session.id };
};
