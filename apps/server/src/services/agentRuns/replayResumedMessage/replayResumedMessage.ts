import { createHash } from "node:crypto";
import type { RuntimeClient } from "@trellis/runtime-protocol/client";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import { invalidInput } from "../../../errors.ts";
import type { ServiceCtx } from "../../support.ts";
import type { StoredRun } from "../types.ts";

export async function replayResumedMessage(
	ctx: ServiceCtx,
	run: StoredRun,
	input: { messageId?: string; text: string },
	client: Pick<RuntimeClient, "inspect">,
) {
	if (input.messageId === undefined) return false;
	const [request] = await ctx.newTx((tx) =>
		rows<{ target: { resumeRunId: string; sessionFingerprint: string; resumeMessageAttemptId: string } }>(
			tx,
			sql`SELECT target FROM agent_start_requests WHERE actor_kind=${ctx.actor.kind} AND actor_name=${ctx.actor.name} AND request_id=${`idle:${input.messageId}`}`,
		),
	);
	if (!request) return false;
	if (
		request.target.resumeRunId !== run.id ||
		request.target.sessionFingerprint !== createHash("sha256").update(input.text).digest("hex")
	)
		throw invalidInput("messageId", "This message ID already belongs to another message.");
	const session = await client.inspect(request.target.resumeMessageAttemptId);
	if (!session.acknowledgedMessageIds.includes(request.target.resumeMessageAttemptId))
		throw new Error("The resumed message has no confirmed receipt. Inspect the session before a resend.");
	return true;
}
