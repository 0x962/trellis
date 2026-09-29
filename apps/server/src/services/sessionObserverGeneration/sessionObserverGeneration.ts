import {
	SESSION_OBSERVER_MODEL_ID,
	type SessionObserverError,
	type SessionObserverMessage,
	type SessionObserverSetEnabledInput,
} from "@trellis/api";
import type { Tx } from "../../db/tx.ts";
import type { SessionObserverActivityItem as StoredActivityItem } from "../sessionObserverActivity";
import {
	readSessionObserverActivity,
	type SessionObserverActivityContext as StoredActivityContext,
} from "../sessionObserverActivity";
import {
	ensureSessionObserverRun,
	generateSessionObserverReply,
	ObserverHarnessError,
	recoverSessionObserverAttempt,
	rolloverSessionObserverConversation,
	type SessionObserverReply,
} from "../sessionObserverHarness";
import {
	claimSessionObserverGeneration,
	failSessionObserverGeneration,
	linkSessionObserverRun,
	listSessionObserverCandidates,
	recoverSessionObserverGenerations,
	type SessionObserverGenerationClaim,
	saveSessionObserverGeneration,
	saveSessionObserverSummary,
	setEnabled,
} from "../sessionObservers";
import type { IoCtx } from "../support.ts";
import {
	beginSessionObserverGeneration,
	cancelSessionObserverGeneration,
	endSessionObserverGeneration,
} from "./cancelSessionObserverGeneration.ts";
import {
	generateSessionObserverNarrative,
	type SessionObserverMessage as NarrativeMessage,
} from "./generateSessionObserverNarrative.ts";
import { readSessionObserverContext } from "./sessionObserverContext.ts";
import {
	type SessionObserverActivityContext,
	type SessionObserverActivityItem,
	type SessionObserverProjectContext,
	type SessionObserverTrigger,
	sessionObserverInput,
} from "./sessionObserverPrompt.ts";
import type { SessionObserverGenerationCandidate } from "./sessionObserverTrigger.ts";
import { sessionObserverTrigger } from "./sessionObserverTrigger.ts";

const summaryMarker = "# Incremental observer context summary";

type ObserverActivityRead = {
	cursor: string;
	items: SessionObserverActivityItem[];
	context: SessionObserverActivityContext[];
	completed: boolean;
	needsInput: boolean;
	unavailable: boolean;
};

type ObserverGenerationInput = {
	observerId: string;
	observerRunId: string;
	sourceRunId: string;
	claimId: string;
	throughCursor: string;
	deliveryId: string;
	instruction: string;
	userContext: string;
	signal: AbortSignal;
};

type SessionObserverGenerationInput = { runId?: string; force?: boolean };

export type SessionObserverGenerationDeps = {
	candidates: (ctx: IoCtx) => Promise<SessionObserverGenerationCandidate[]>;
	activity: (ctx: IoCtx, input: { runId: string; cursor: string | null }) => Promise<ObserverActivityRead>;
	claim: (
		ctx: IoCtx,
		input: { runId: string; throughCursor: string },
	) => Promise<SessionObserverGenerationClaim | null>;
	ensureRun: (
		ctx: IoCtx,
		input: { observerId: string; sourceRunId: string; modelId: string },
	) => Promise<{ observerRunId: string }>;
	linkRun: (
		ctx: IoCtx,
		input: { runId: string; claimId: string; observerRunId: string },
	) => Promise<SessionObserverGenerationClaim | null>;
	context: (ctx: IoCtx, input: { runId: string }) => Promise<SessionObserverProjectContext>;
	generate: (ctx: IoCtx, input: ObserverGenerationInput) => Promise<SessionObserverReply>;
	saveSummary: (
		ctx: IoCtx,
		input: { runId: string; claimId: string; message: NarrativeMessage & { role: "user" } },
	) => Promise<SessionObserverMessage | null>;
	rollover: (
		ctx: IoCtx,
		input: {
			sourceRunId: string;
			observerRunId: string;
			claimId: string;
			expectedProviderSessionId: string;
			summaryMessageId: string;
		},
	) => Promise<{ providerSessionId: string }>;
	save: (
		ctx: IoCtx,
		input: {
			runId: string;
			claimId: string;
			throughCursor: string;
			messages: NarrativeMessage[];
			update: { body: string };
		},
	) => Promise<unknown | null>;
	fail: (ctx: IoCtx, input: { runId: string; claimId: string; error: SessionObserverError }) => Promise<unknown | null>;
	recoverClaims: (ctx: IoCtx) => Promise<Array<{ runId: string; observerRunId: string | null }>>;
	recoverAttempt: (ctx: IoCtx, input: { observerRunId: string }) => Promise<void>;
};

const activityItem = (item: StoredActivityItem): SessionObserverActivityItem =>
	item.kind === "message"
		? { kind: "message", role: item.role, name: null, body: item.text }
		: {
				kind: "tool",
				role: null,
				name: item.tool.name,
				body: JSON.stringify({
					...(item.tool.input === undefined ? {} : { input: item.tool.input }),
					...(item.tool.output === undefined ? {} : { output: item.tool.output }),
					...(item.tool.updates === undefined ? {} : { updates: item.tool.updates }),
					...(item.error === undefined ? {} : { error: item.error }),
				}),
			};

const activityContext = (item: StoredActivityContext): SessionObserverActivityContext => ({
	kind: "message",
	role: item.role,
	body: item.text,
});

const dependencies: SessionObserverGenerationDeps = {
	candidates: (ctx) => ctx.newTx(listSessionObserverCandidates),
	activity: async (ctx, input) => {
		const read = await readSessionObserverActivity(ctx, { runId: input.runId, after: input.cursor });
		return {
			cursor: read.cursor,
			items: read.items.map(activityItem),
			context: read.context.map(activityContext),
			completed: read.signals.some((signal) => signal.kind === "completion"),
			needsInput: read.signals.some((signal) => signal.kind === "input-request"),
			unavailable: read.signals.some(
				(signal) =>
					signal.kind === "unavailable" ||
					(signal.kind === "completion" && signal.messageAvailability === "unavailable"),
			),
		};
	},
	claim: (ctx, input) => ctx.newTx((tx) => claimSessionObserverGeneration(tx, input)),
	ensureRun: ensureSessionObserverRun,
	linkRun: (ctx, input) => ctx.newTx((tx) => linkSessionObserverRun(tx, input)),
	context: (ctx, input) => ctx.newTx((tx) => readSessionObserverContext(ctx.core, tx, input)),
	generate: generateSessionObserverReply,
	saveSummary: (ctx, input) => ctx.newTx((tx) => saveSessionObserverSummary(ctx.core, tx, input)),
	rollover: rolloverSessionObserverConversation,
	save: (ctx, input) => ctx.newTx((tx) => saveSessionObserverGeneration(ctx.core, tx, input)),
	fail: (ctx, input) => ctx.newTx((tx) => failSessionObserverGeneration(ctx.core, tx, input)),
	recoverClaims: (ctx) => ctx.newTx((tx) => recoverSessionObserverGenerations(ctx.core, tx)),
	recoverAttempt: recoverSessionObserverAttempt,
};

class InactiveSessionObserverClaim extends Error {}

const observerError = (error: unknown): SessionObserverError => {
	if (!(error instanceof ObserverHarnessError))
		return { code: "CLAUDE_GENERATION_FAILED", message: "The Claude observer could not write an update." };
	if (error.code === "OBSERVER_ACCOUNT_UNAVAILABLE")
		return { code: "CLAUDE_ACCOUNT_UNAVAILABLE", message: error.message };
	if (error.code === "OBSERVER_MODEL_UNAVAILABLE") return { code: "CLAUDE_MODEL_UNAVAILABLE", message: error.message };
	if (error.code === "OBSERVER_CONVERSATION_LOST") return { code: "CLAUDE_CONVERSATION_LOST", message: error.message };
	if (
		error.code === "OBSERVER_DELIVERY_UNKNOWN" ||
		error.code === "OBSERVER_REPLY_INCOMPLETE" ||
		error.code === "OBSERVER_CANCEL_UNCONFIRMED"
	)
		return { code: "CLAUDE_LAUNCH_UNCONFIRMED", message: error.message };
	return { code: "CLAUDE_GENERATION_FAILED", message: error.message };
};

const hasUnfinishedSummary = (messages: readonly SessionObserverMessage[]) => {
	const summaryIndex = messages.findLastIndex(
		(message) => message.role === "user" && message.body.startsWith(summaryMarker),
	);
	return summaryIndex !== -1 && !messages.slice(summaryIndex + 1).some((message) => message.role === "assistant");
};

const ensureClaimRun = async (
	ctx: IoCtx,
	deps: SessionObserverGenerationDeps,
	claim: SessionObserverGenerationClaim,
) => {
	if (claim.observerRunId !== null) return claim;
	const run = await deps.ensureRun(ctx, {
		observerId: claim.observerId,
		sourceRunId: claim.runId,
		modelId: SESSION_OBSERVER_MODEL_ID,
	});
	return deps.linkRun(ctx, { runId: claim.runId, claimId: claim.claimId, observerRunId: run.observerRunId });
};

const dispatchCandidate = async (
	ctx: IoCtx,
	deps: SessionObserverGenerationDeps,
	candidate: SessionObserverGenerationCandidate,
	force: boolean,
) => {
	const activity = await deps.activity(ctx, {
		runId: candidate.runId,
		cursor: candidate.lastConsumedCursor,
	});
	const trigger: SessionObserverTrigger | null = force
		? "initial"
		: sessionObserverTrigger(candidate, {
				itemCount: activity.items.length,
				completed: activity.completed,
				needsInput: activity.needsInput,
				unavailable: activity.unavailable,
			});
	if (trigger === null) return "not-due" as const;
	const claimed = await deps.claim(ctx, { runId: candidate.runId, throughCursor: activity.cursor });
	if (claimed === null) return "not-claimed" as const;

	const controller = beginSessionObserverGeneration(candidate.runId);
	try {
		const claim = await ensureClaimRun(ctx, deps, claimed);
		if (claim === null || claim.observerRunId === null) return "discarded" as const;
		const observerRunId = claim.observerRunId;
		const context = await deps.context(ctx, { runId: candidate.runId });
		const userMessage = sessionObserverInput({
			context,
			activity: activity.items,
			uncertainActivity: activity.context,
			activityUnavailable: activity.unavailable,
			trigger,
		});
		const reuseSummary = hasUnfinishedSummary(claim.messages);
		const messages: NarrativeMessage[] = [
			...claim.messages.map(({ role, body }) => ({ role, body })),
			...(reuseSummary ? [] : [{ role: "user" as const, body: userMessage }]),
		];
		const generate = (turn: { instruction: string; userContext: string; deliveryId: string }) =>
			deps.generate(ctx, {
				observerId: claim.observerId,
				observerRunId,
				sourceRunId: claim.runId,
				claimId: claim.claimId,
				throughCursor: claim.throughCursor,
				deliveryId: turn.deliveryId,
				instruction: turn.instruction,
				userContext: turn.userContext,
				signal: controller.signal,
			});
		const result = await generateSessionObserverNarrative(
			{
				messages,
				summaryStored: reuseSummary,
				beforeNarrativeAfterSummary: async (summary, generations) => {
					const saved = await deps.saveSummary(ctx, {
						runId: claim.runId,
						claimId: claim.claimId,
						message: summary,
					});
					if (saved === null) throw new InactiveSessionObserverClaim();
					const providerSessionId = generations.at(-1)?.providerSessionId;
					if (providerSessionId === undefined) throw new Error("The observer summary has no conversation identity.");
					await deps.rollover(ctx, {
						sourceRunId: claim.runId,
						observerRunId,
						claimId: claim.claimId,
						expectedProviderSessionId: providerSessionId,
						summaryMessageId: saved.id,
					});
				},
			},
			generate,
		);
		const saved = await deps.save(ctx, {
			runId: candidate.runId,
			claimId: claim.claimId,
			throughCursor: claim.throughCursor,
			messages: [
				...(reuseSummary || result.incrementalSummary !== null ? [] : [{ role: "user" as const, body: userMessage }]),
				{ role: "assistant", body: result.generation.text },
			],
			update: { body: result.generation.text },
		});
		return saved === null ? ("discarded" as const) : ("saved" as const);
	} catch (error) {
		if (error instanceof InactiveSessionObserverClaim) return "discarded" as const;
		await deps.fail(ctx, {
			runId: candidate.runId,
			claimId: claimed.claimId,
			error: observerError(error),
		});
		return "failed" as const;
	} finally {
		endSessionObserverGeneration(candidate.runId, controller);
	}
};

export const prepareSessionObserverGenerations = async (
	ctx: IoCtx,
	input: SessionObserverGenerationInput,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const candidates = (await deps.candidates(ctx)).filter(
		(candidate) => input.runId === undefined || candidate.runId === input.runId,
	);
	const results = await Promise.all(
		candidates.map((candidate) => dispatchCandidate(ctx, deps, candidate, input.force ?? false)),
	);
	return {
		checked: candidates.length,
		saved: results.filter((result) => result === "saved").length,
		failed: results.filter((result) => result === "failed").length,
	};
};

export const requestSessionObserverGeneration = (ctx: IoCtx, runId: string) =>
	prepareSessionObserverGenerations(ctx, { runId, force: true });

export const recoverSessionObserverGeneration = async (
	ctx: IoCtx,
	_input: Record<string, never>,
	deps: SessionObserverGenerationDeps = dependencies,
) => {
	const claims = await deps.recoverClaims(ctx);
	for (const claim of claims) {
		if (claim.observerRunId !== null) await deps.recoverAttempt(ctx, { observerRunId: claim.observerRunId });
	}
	return { recovered: claims.length };
};

export const setSessionObserverEnabled = async (ctx: IoCtx, tx: Tx, input: SessionObserverSetEnabledInput) => {
	const result = await setEnabled(ctx.core, tx, input);
	ctx.afterCommit(async () => {
		if (result.cancelGeneration) cancelSessionObserverGeneration(ctx.core, result.observer.runId);
		if (result.requestInitialGeneration) await requestSessionObserverGeneration(ctx, result.observer.runId);
	});
	return result.observer;
};

export const finishSessionObserverGenerations = (
	_ctx: IoCtx,
	_tx: Tx,
	input: { checked: number; saved: number; failed: number },
) => Promise.resolve(input);

export const finishSessionObserverRecovery = (_ctx: IoCtx, _tx: Tx, input: { recovered: number }) =>
	Promise.resolve(input);
