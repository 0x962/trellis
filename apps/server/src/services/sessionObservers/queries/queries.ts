import {
	SESSION_OBSERVER_ACTIVITY_THRESHOLD,
	type SessionObserver,
	type SessionObserverHistory,
	type SessionObserverMessage,
} from "@trellis/api";
import { sql } from "drizzle-orm";
import { iso, rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { getRun } from "../../agentRuns/index.ts";

const observerColumns = sql`o.run_id AS "runId", o.enabled, o.observer_id AS "observerId",
	o.observer_run_id AS "observerRunId", o.activity_threshold AS "activityThreshold",
	o.generation_state AS "generationState", o.generation, o.last_consumed_cursor AS "lastConsumedCursor",
	o.last_attempted_cursor AS "lastAttemptedCursor",
	CASE WHEN o.error IS NULL THEN NULL ELSE jsonb_build_object('code', o.error_code, 'message', o.error) END AS error`;

const messageColumns = sql`id, observer_id AS "observerId", generation, position, role, body,
	${iso(sql`created_at`)} AS "createdAt"`;

export type StoredSessionObserver = Omit<
	SessionObserver,
	"observerId" | "harnessPreset" | "accountId" | "modelId" | "providerSessionId"
> & {
	observerId: string;
	generationClaimId: string | null;
	generationCursor: string | null;
};

export const sessionObserverByRun = async (
	tx: Tx,
	input: { runId: string; lock?: boolean },
): Promise<StoredSessionObserver | null> => {
	const [observer] = await rows<StoredSessionObserver>(
		tx,
		sql`SELECT ${observerColumns}, o.generation_claim_id AS "generationClaimId",
		o.generation_cursor AS "generationCursor" FROM session_observers o WHERE o.run_id=${input.runId}
		${input.lock ? sql`FOR UPDATE OF o` : sql``}`,
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
	observerRunId: null,
	harnessPreset: null,
	accountId: null,
	modelId: null,
	providerSessionId: null,
	activityThreshold: SESSION_OBSERVER_ACTIVITY_THRESHOLD,
	generationState: "idle",
	generation: 0,
	lastConsumedCursor: null,
	lastAttemptedCursor: null,
	error: null,
});

export const readSessionObserver = async (tx: Tx, runId: string): Promise<SessionObserver> => {
	const observer = await sessionObserverByRun(tx, { runId });
	if (observer === null) return emptySessionObserver(runId);
	const observerRun = observer.observerRunId === null ? null : await getRun(tx, observer.observerRunId);
	const { generationClaimId: _generationClaimId, generationCursor: _generationCursor, ...metadata } = observer;
	return {
		...metadata,
		harnessPreset: (observerRun?.harness?.preset ?? null) as SessionObserver["harnessPreset"],
		accountId: observerRun?.accountId ?? null,
		modelId: observerRun?.harness?.model ?? null,
		providerSessionId: observerRun?.sessionId ?? null,
	};
};

export const readSessionObserverHistory = async (tx: Tx, runId: string): Promise<SessionObserverHistory> => {
	const observer = await sessionObserverByRun(tx, { runId });
	if (observer === null) return { runId, observerId: null, messages: [] };
	return {
		runId,
		observerId: observer.observerId,
		messages: await sessionObserverMessages(tx, { observerId: observer.observerId }),
	};
};

export type SessionObserverCandidate = {
	runId: string;
	observerRunId: string | null;
	lastConsumedCursor: string | null;
	lastAttemptedCursor: string | null;
	hasObserverMessages: boolean;
	activityThreshold: number;
};

export const listSessionObserverCandidates = async (tx: Tx): Promise<SessionObserverCandidate[]> =>
	rows<SessionObserverCandidate>(
		tx,
		sql`SELECT o.run_id AS "runId", o.observer_run_id AS "observerRunId",
		o.last_consumed_cursor AS "lastConsumedCursor",
		o.last_attempted_cursor AS "lastAttemptedCursor",
		EXISTS (SELECT 1 FROM session_observer_messages m WHERE m.observer_id=o.observer_id) AS "hasObserverMessages",
		o.activity_threshold AS "activityThreshold"
		FROM session_observers o WHERE o.enabled ORDER BY o.run_id`,
	);
