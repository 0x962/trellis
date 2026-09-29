import type { RuntimeHarnessObservation, RuntimeOutput } from "@trellis/runtime-protocol";
import { sql } from "drizzle-orm";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { IoCtx } from "../support.ts";
import { LegacyActivity } from "./legacyActivity/index.ts";
import type {
	SessionObserverActivityContext,
	SessionObserverActivityCursor,
	SessionObserverActivityItem,
	SessionObserverActivityRead,
	SessionObserverActivitySignal,
} from "./types.ts";

type Attempt = { id: string; generation: number; createdAt: string };
type CursorState = {
	version: 1;
	runId: string;
	attempts: Array<{ generation: number; attemptId: string; offset: number; unavailable: boolean }>;
};
type ReadEvents = (attemptId: string, offset: number) => Promise<RuntimeOutput>;

const cursorPrefix = "session-activity-v1.";

const encodeCursor = (cursor: CursorState): SessionObserverActivityCursor =>
	`${cursorPrefix}${Buffer.from(JSON.stringify(cursor)).toString("base64url")}`;

const decodeCursor = (cursor: SessionObserverActivityCursor | null, runId: string): CursorState => {
	if (cursor === null) return { version: 1, runId, attempts: [] };
	if (!cursor.startsWith(cursorPrefix)) throw new Error("The session activity cursor has an unknown version.");
	const value = JSON.parse(Buffer.from(cursor.slice(cursorPrefix.length), "base64url").toString("utf8")) as CursorState;
	if (
		value.version !== 1 ||
		value.runId !== runId ||
		!Array.isArray(value.attempts) ||
		value.attempts.some(
			(attempt) =>
				!Number.isSafeInteger(attempt.generation) ||
				attempt.generation < 1 ||
				typeof attempt.attemptId !== "string" ||
				!Number.isSafeInteger(attempt.offset) ||
				attempt.offset < 0 ||
				typeof attempt.unavailable !== "boolean",
		)
	)
		throw new Error("The session activity cursor is invalid.");
	return value;
};

const attemptsForRun = (ctx: Pick<IoCtx, "newTx">, runId: string) =>
	ctx.newTx((tx) =>
		rows<Attempt>(
			tx,
			sql`SELECT id, generation, ${iso(sql`created_at`)} AS "createdAt"
			FROM agent_execution_attempts WHERE run_id=${runId} ORDER BY generation`,
		),
	);

const attemptIdentity = (attempt: Attempt) => ({ attemptId: attempt.id, attemptGeneration: attempt.generation });

const unavailableSignal = (attempt: Attempt): SessionObserverActivitySignal => ({
	...attemptIdentity(attempt),
	id: `unavailable:${attempt.id}`,
	kind: "unavailable",
	at: attempt.createdAt,
	reason: "activity-unavailable",
});

async function readAttemptFrom(
	attempt: Attempt,
	startOffset: number,
	emitAfter: number,
	readEvents: ReadEvents,
): Promise<{
	offset: number;
	items: SessionObserverActivityItem[];
	context: SessionObserverActivityContext[];
	signals: SessionObserverActivitySignal[];
	legacy: boolean;
}> {
	const items: SessionObserverActivityItem[] = [];
	const context: SessionObserverActivityContext[] = [];
	const signals: SessionObserverActivitySignal[] = [];
	const legacy = new LegacyActivity();
	let legacySeen = false;
	let pending = Buffer.alloc(0);
	let pendingOffset = startOffset;
	let committedOffset = emitAfter;
	let nextOffset = startOffset;
	while (true) {
		let output: RuntimeOutput;
		try {
			output = await readEvents(attempt.id, nextOffset);
		} catch (error) {
			if ((error as { code?: string }).code !== "SESSION_NOT_FOUND") throw error;
			return {
				offset: committedOffset,
				items,
				context,
				signals: [...signals, unavailableSignal(attempt)],
				legacy: legacySeen,
			};
		}
		if (output.truncated || output.startOffset !== nextOffset)
			return {
				offset: committedOffset,
				items,
				context,
				signals: [...signals, unavailableSignal(attempt)],
				legacy: legacySeen,
			};
		const bytes = Buffer.from(output.data, "base64");
		if (bytes.length === 0) break;
		if (pending.length === 0) pendingOffset = output.startOffset;
		pending = Buffer.concat([pending, bytes]);
		nextOffset = output.nextOffset;
		let end = pending.indexOf(10);
		while (end >= 0) {
			let observation: RuntimeHarnessObservation;
			try {
				observation = JSON.parse(pending.subarray(0, end).toString("utf8"));
			} catch {
				return {
					offset: committedOffset,
					items,
					context,
					signals: [...signals, unavailableSignal(attempt)],
					legacy: legacySeen,
				};
			}
			legacySeen ||= observation.activityVersion !== 1;
			const derived =
				observation.activityVersion === 1
					? { activity: observation.activity, signal: observation.signal, context: observation.context }
					: legacy.read(observation.event, observation.observedAt);
			const lineOffset = pendingOffset + end + 1;
			if (lineOffset > emitAfter) {
				if (derived.context !== undefined) context.push({ ...derived.context, ...attemptIdentity(attempt) });
				if (derived.activity !== undefined) items.push({ ...derived.activity, ...attemptIdentity(attempt) });
				if (derived.signal !== undefined) signals.push({ ...derived.signal, ...attemptIdentity(attempt) });
			}
			committedOffset = Math.max(emitAfter, lineOffset);
			pending = pending.subarray(end + 1);
			pendingOffset = lineOffset;
			end = pending.indexOf(10);
		}
	}
	return { offset: committedOffset, items, context, signals, legacy: legacySeen };
}

async function readAttempt(
	attempt: Attempt,
	offset: number,
	readEvents: ReadEvents,
): Promise<{
	offset: number;
	items: SessionObserverActivityItem[];
	context: SessionObserverActivityContext[];
	signals: SessionObserverActivitySignal[];
}> {
	const incremental = await readAttemptFrom(attempt, offset, offset, readEvents);
	if (offset === 0 || !incremental.legacy) return incremental;
	return readAttemptFrom(attempt, 0, offset, readEvents);
}

export async function readSessionObserverActivity(
	ctx: Pick<IoCtx, "home" | "newTx">,
	input: { runId: string; after: SessionObserverActivityCursor | null },
	readEvents: ReadEvents = (attemptId, offset) => nativeHost(ctx.home).output(attemptId, offset, "events"),
): Promise<SessionObserverActivityRead> {
	const attempts = await attemptsForRun(ctx, input.runId);
	const after = decodeCursor(input.after, input.runId);
	const items: SessionObserverActivityItem[] = [];
	const context: SessionObserverActivityContext[] = [];
	const signals: SessionObserverActivitySignal[] = [];
	const cursor: CursorState = { version: 1, runId: input.runId, attempts: [] };
	if (
		after.attempts.some(
			(saved) => !attempts.some((attempt) => attempt.id === saved.attemptId && attempt.generation === saved.generation),
		)
	)
		throw new Error("The session activity cursor does not match this run.");
	for (const attempt of attempts) {
		const saved = after.attempts.find((entry) => entry.attemptId === attempt.id);
		const read = await readAttempt(attempt, saved?.offset ?? 0, readEvents);
		items.push(...read.items);
		context.push(...read.context);
		signals.push(...read.signals.filter((signal) => signal.kind !== "unavailable" || !saved?.unavailable));
		cursor.attempts.push({
			generation: attempt.generation,
			attemptId: attempt.id,
			offset: read.offset,
			unavailable: read.signals.some((signal) => signal.kind === "unavailable"),
		});
	}
	return { cursor: encodeCursor(cursor), items, context, signals };
}
