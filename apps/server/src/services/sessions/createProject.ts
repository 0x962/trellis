import type { Session, SessionCreateInput } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import { agentWorkspace } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import { invalidInput } from "../../errors.ts";
import { startNative } from "../agentRuns/nativeStart.ts";
import { reserve } from "../agentRuns/reserve.ts";
import type { IoCtx } from "../support.ts";
import { attachmentPrompt, type prepareFiles } from "./attachments.ts";
import { launchSession } from "./launchSession";
import { sessionColumns, sessionNames } from "./queries.ts";
import { uniqueSessionName } from "./sessionName.ts";

export async function createProjectSession(
	ctx: IoCtx,
	input: SessionCreateInput,
	name: string,
	fingerprint: string,
	files: Awaited<ReturnType<typeof prepareFiles>>,
	start: typeof startNative = startNative,
) {
	const reservation = await ctx.newTx(async (tx) => {
		const reservation = await reserve(
			ctx.core,
			tx,
			{
				project: input.project!,
				harness: input.harness,
				accountId: input.accountId,
				requestId: input.requestId,
			},
			[],
			{
				session: {
					name: uniqueSessionName(name, new Set(await sessionNames(tx))),
					instruction: input.prompt,
					fingerprint,
				},
			},
		);
		if (reservation.replay) {
			const [session] = await rows<Session>(
				tx,
				sql`SELECT ${sessionColumns} FROM sessions WHERE run_id=${reservation.run.id}`,
			);
			if (!session) throw invalidInput("requestId", "This request created a deleted session. Use a new request ID.");
			return { replay: true as const, session };
		}
		reservation.run.instruction = await attachmentPrompt(ctx.home, reservation.run.id, input.prompt, files);
		await tx.execute(
			sql`UPDATE agent_runs SET instruction=${reservation.run.instruction} WHERE id=${reservation.run.id}`,
		);
		const directory = agentWorkspace(ctx.home, reservation.run.id);
		const [session] = await rows<Session>(
			tx,
			sql`INSERT INTO sessions (id,name,directory,harness,run_id,created_at,updated_at)
			VALUES (${ulid()},${reservation.run.name},${directory},${JSON.stringify(reservation.config.harness)}::jsonb,${reservation.run.id},${ctx.now()},${ctx.now()}) RETURNING ${sessionColumns}`,
		);
		return { ...reservation, session: session! };
	});
	if (reservation.replay) return { id: reservation.session.id };
	launchSession(ctx, reservation.session.id, reservation, start);
	ctx.emit({ type: "sessions.changed", id: reservation.session.id });
	ctx.emit({ type: "agent-runs.changed", id: reservation.run.id });
	return { id: reservation.session.id };
}
