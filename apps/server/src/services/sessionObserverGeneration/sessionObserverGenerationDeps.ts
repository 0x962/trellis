import type { SessionObserverError, SessionObserverMessage } from "@trellis/api";
import {
	readSessionObserverActivity,
	type SessionObserverActivityContext as StoredActivityContext,
	type SessionObserverActivityItem as StoredActivityItem,
} from "../sessionObserverActivity";
import {
	ensureSessionObserverRun,
	generateSessionObserverReply,
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
} from "../sessionObservers";
import type { IoCtx } from "../support.ts";
import type { SessionObserverMessage as NarrativeMessage } from "./generateSessionObserverNarrative.ts";
import { readSessionObserverContext } from "./sessionObserverContext.ts";
import type {
	SessionObserverActivityContext,
	SessionObserverActivityItem,
	SessionObserverProjectContext,
} from "./sessionObserverPrompt.ts";
import type { SessionObserverGenerationCandidate } from "./sessionObserverTrigger.ts";

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

export const dependencies: SessionObserverGenerationDeps = {
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
