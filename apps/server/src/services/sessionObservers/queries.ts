import { SESSION_OBSERVER_ACTIVITY_THRESHOLD, type SessionObserver, type SessionObserverMessage } from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";

const observerColumns = sql`run_id AS "runId", enabled, observer_id AS "observerId", provider_id AS "providerId",
	model_id AS "modelId", activity_threshold AS "activityThreshold", generation_state AS "generationState",
	generation, last_consumed_cursor AS "lastConsumedCursor", error`;

const messageColumns = sql`id, observer_id AS "observerId", generation, position, role, body,
	${iso(sql`created_at`)} AS "createdAt"`;

export type StoredSessionObserver = Omit<SessionObserver, "messages" | "observerId" | "providerId" | "modelId"> & {
	observerId: string;
	providerId: string | null;
	modelId: string;
	generationClaimId: string | null;
	generationCursor: string | null;
};

export const sessionObserverByRun = async (
	tx: Tx,
	input: { runId: string; lock?: boolean },
): Promise<StoredSessionObserver | null> => {
	const [observer] = await rows<StoredSessionObserver>(
		tx,
		sql`SELECT ${observerColumns}, generation_claim_id AS "generationClaimId",
		generation_cursor AS "generationCursor" FROM session_observers WHERE run_id=${input.runId}
		${input.lock ? sql`FOR UPDATE` : sql``}`,
	);
	return observer ?? null;
};

export const sessionObserverMessages = async (
	tx: Tx,
	input: { observerId: string },
): Promise<SessionObserverMessage[]> =>
	rows<SessionObserverMessage>(
		tx,
		sql`SELECT ${messageColumns} FROM session_observer_messages WHERE observer_id=${input.observerId}
		ORDER BY generation, position`,
	);

export const emptySessionObserver = (runId: string): SessionObserver => ({
	runId,
	enabled: false,
	observerId: null,
	providerId: null,
	modelId: null,
	activityThreshold: SESSION_OBSERVER_ACTIVITY_THRESHOLD,
	generationState: "idle",
	generation: 0,
	lastConsumedCursor: null,
	error: null,
	messages: [],
});

export const readSessionObserver = async (tx: Tx, runId: string): Promise<SessionObserver> => {
	const observer = await sessionObserverByRun(tx, { runId });
	if (observer === null) return emptySessionObserver(runId);
	return { ...observer, messages: await sessionObserverMessages(tx, { observerId: observer.observerId }) };
};

export type SessionObserverCandidate = {
	runId: string;
	lastConsumedCursor: string | null;
	hasInitialUpdate: boolean;
	activityThreshold: number;
};

export const listSessionObserverCandidates = async (tx: Tx): Promise<SessionObserverCandidate[]> =>
	rows<SessionObserverCandidate>(
		tx,
		sql`SELECT o.run_id AS "runId", o.last_consumed_cursor AS "lastConsumedCursor",
		EXISTS (SELECT 1 FROM session_observer_messages m WHERE m.observer_id=o.observer_id) AS "hasInitialUpdate",
		o.activity_threshold AS "activityThreshold"
		FROM session_observers o WHERE o.enabled AND o.provider_id IS NOT NULL ORDER BY o.run_id`,
	);
