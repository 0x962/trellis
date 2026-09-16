import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";

export type ExecutionAttempt = { id: string; generation: number; token: string };
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const reserveAttempt = async (
	ctx: Pick<RequestContext, "now">,
	tx: Tx,
	input: { runId: string; attempt?: { id: string; token: string } },
) => {
	const id = input.attempt?.id ?? randomUUID();
	const token = input.attempt?.token ?? randomBytes(32).toString("base64url");
	const [attempt] = await rows<{ generation: number }>(
		tx,
		sql`INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at)
		SELECT ${id}, ${input.runId}, coalesce(max(generation), 0) + 1, ${tokenHash(token)}, ${ctx.now}
		FROM agent_execution_attempts WHERE run_id = ${input.runId} RETURNING generation`,
	);
	return { id, generation: attempt!.generation, token } satisfies ExecutionAttempt;
};

export const assertCurrentAttempt = async (ctx: Pick<RequestContext, "actor" | "attemptToken">, tx: Tx) => {
	if (ctx.actor?.kind !== "agent") return;
	const [attempt] = await rows<{ token_hash: string; closed_at: string | null; terminal_id: string; id: string }>(
		tx,
		sql`SELECT a.token_hash, r.closed_at, r.terminal_id, a.id FROM agent_execution_attempts a JOIN agent_runs r ON r.id = a.run_id
		WHERE a.run_id = ${ctx.actor.name} ORDER BY a.generation DESC LIMIT 1`,
	);
	if (!attempt) return;
	if (
		!ctx.attemptToken ||
		attempt.closed_at !== null ||
		attempt.terminal_id !== attempt.id ||
		!timingSafeEqual(Buffer.from(attempt.token_hash, "hex"), Buffer.from(tokenHash(ctx.attemptToken), "hex"))
	)
		throw invalidInput("attempt", "This agent execution attempt cannot change Trellis. Use the current attempt token.");
};
