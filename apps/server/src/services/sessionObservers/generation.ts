import type {
	SessionObserver,
	SessionObserverError,
	SessionObserverMessage,
	SessionObserverMessageInput,
	SessionObserverUpdateInput,
	SessionUpdate,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveSessionUpdateOwner } from "../sessionUpdates/owner.ts";
import { saveSessionUpdate } from "../sessionUpdates/save.ts";
import { readSessionObserver, sessionObserverByRun, sessionObserverMessages } from "./queries.ts";

export type SessionObserverGenerationClaim = {
	observerId: string;
	runId: string;
	observerRunId: string | null;
	generation: number;
	claimId: string;
	fromCursor: string | null;
	throughCursor: string;
	messages: SessionObserverMessage[];
};

export const claimSessionObserverGeneration = async (
	tx: Tx,
	input: { runId: string; throughCursor: string },
): Promise<SessionObserverGenerationClaim | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState === "generating" ||
		observer.lastConsumedCursor === input.throughCursor ||
		observer.lastAttemptedCursor === input.throughCursor
	)
		return null;
	const claimId = crypto.randomUUID();
	const generation = observer.generation + 1;
	await tx.execute(sql`UPDATE session_observers SET generation_state='generating', generation=${generation},
		generation_claim_id=${claimId}, generation_cursor=${input.throughCursor} WHERE run_id=${input.runId}`);
	return {
		observerId: observer.observerId,
		runId: observer.runId,
		observerRunId: observer.observerRunId,
		generation,
		claimId,
		fromCursor: observer.lastConsumedCursor,
		throughCursor: input.throughCursor,
		messages: await sessionObserverMessages(tx, { observerId: observer.observerId }),
	};
};

export type AppendSessionObserverMessagesInput = {
	observerId: string;
	generation: number;
	messages: SessionObserverMessageInput[];
	createdAt: Date;
};

export const appendSessionObserverMessages = async (
	tx: Tx,
	input: AppendSessionObserverMessagesInput,
): Promise<SessionObserverMessage[]> => {
	await tx.execute(sql`SELECT run_id FROM session_observers WHERE observer_id=${input.observerId} FOR UPDATE`);
	const [last] = await rows<{ position: number }>(
		tx,
		sql`SELECT coalesce(max(position), -1)::int AS position FROM session_observer_messages
		WHERE observer_id=${input.observerId} AND generation=${input.generation}`,
	);
	const saved: SessionObserverMessage[] = [];
	for (const [offset, message] of input.messages.entries()) {
		const position = last!.position + offset + 1;
		const [row] = await rows<SessionObserverMessage>(
			tx,
			sql`INSERT INTO session_observer_messages (id, observer_id, generation, position, role, body, created_at)
			VALUES (${ulid()}, ${input.observerId}, ${input.generation}, ${position}, ${message.role}, ${message.body}, ${input.createdAt})
			RETURNING id, observer_id AS "observerId", generation, position, role, body,
			${iso(sql`created_at`)} AS "createdAt"`,
		);
		saved.push(row!);
	}
	return saved;
};

export const saveSessionObserverSummary = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string; claimId: string; message: SessionObserverMessageInput & { role: "user" } },
): Promise<SessionObserverMessage | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId
	)
		return null;
	const [existing] = await rows<SessionObserverMessage>(
		tx,
		sql`SELECT id, observer_id AS "observerId", generation, position, role, body,
		${iso(sql`created_at`)} AS "createdAt" FROM session_observer_messages
		WHERE observer_id=${observer.observerId} AND generation=${observer.generation} AND position=0`,
	);
	if (existing) return existing;
	const [saved] = await appendSessionObserverMessages(tx, {
		observerId: observer.observerId,
		generation: observer.generation,
		messages: [input.message],
		createdAt: ctx.now,
	});
	return saved!;
};

export type SaveSessionObserverGenerationInput = {
	runId: string;
	claimId: string;
	throughCursor: string;
	messages: SessionObserverMessageInput[];
	update: SessionObserverUpdateInput;
};

export type SessionObserverGenerationSave = {
	observer: SessionObserver;
	update: SessionUpdate;
};

export const saveSessionObserverGeneration = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SaveSessionObserverGenerationInput,
): Promise<SessionObserverGenerationSave | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId ||
		observer.generationCursor !== input.throughCursor
	)
		return null;
	await appendSessionObserverMessages(tx, {
		observerId: observer.observerId,
		generation: observer.generation,
		messages: input.messages,
		createdAt: ctx.now,
	});
	const owner = await resolveSessionUpdateOwner(tx, input.runId);
	const update = await saveSessionUpdate(ctx, tx, { owner, ...input.update });
	await tx.execute(sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		generation_cursor=NULL, last_consumed_cursor=${input.throughCursor}, last_attempted_cursor=NULL,
		error_code=NULL, error=NULL, updated_at=${ctx.now}
		WHERE run_id=${input.runId}`);
	return { observer: await readSessionObserver(tx, input.runId), update };
};

export const failSessionObserverGeneration = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string; claimId: string; error: SessionObserverError },
): Promise<SessionObserver | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState !== "generating" ||
		observer.generationClaimId !== input.claimId
	)
		return null;
	await tx.execute(sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		last_attempted_cursor=generation_cursor, generation_cursor=NULL, error_code=${input.error.code},
		error=${input.error.message}, updated_at=${ctx.now}
		WHERE run_id=${input.runId}`);
	return readSessionObserver(tx, input.runId);
};

export type RecoveredSessionObserverGeneration = {
	runId: string;
	observerRunId: string | null;
};

export const recoverSessionObserverGenerations = async (
	ctx: ServiceCtx,
	tx: Tx,
): Promise<RecoveredSessionObserverGeneration[]> => {
	const recovered = await rows<RecoveredSessionObserverGeneration>(
		tx,
		sql`UPDATE session_observers SET generation_state='idle', generation_claim_id=NULL,
		generation_cursor=NULL, updated_at=${ctx.now} WHERE generation_state='generating'
		RETURNING run_id AS "runId", observer_run_id AS "observerRunId"`,
	);
	return recovered;
};

export const retrySessionObserverGeneration = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { runId: string },
): Promise<SessionObserver | null> => {
	const observer = await sessionObserverByRun(tx, { runId: input.runId, lock: true });
	if (
		observer === null ||
		!observer.enabled ||
		observer.generationState === "generating" ||
		observer.lastAttemptedCursor === null
	)
		return null;
	await tx.execute(sql`UPDATE session_observers SET last_attempted_cursor=NULL, error_code=NULL, error=NULL,
		updated_at=${ctx.now}
		WHERE run_id=${input.runId}`);
	return readSessionObserver(tx, input.runId);
};
