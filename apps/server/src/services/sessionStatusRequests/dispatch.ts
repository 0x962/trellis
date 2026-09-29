import { randomUUID } from "node:crypto";
import type { SessionUpdateRequest } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { nativeHost } from "../../agents/native/harnessHost.ts";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import {
	beginSessionUpdateRequest,
	getSessionUpdateRequest,
	sessionUpdateRequestIsOutstanding,
	setSessionUpdateRequestState,
} from "../sessionUpdates";
import type { IoCtx } from "../support.ts";
import { type SessionStatusRequestCandidate, sessionStatusRequestCandidates } from "./candidates.ts";
import { sessionStatusRequestPrompt } from "./prompt.ts";

export const SESSION_STATUS_REQUEST_INTERVAL_MS = 5 * 60 * 1000;

export type SessionStatusRequestDeps = {
	candidates: (ctx: IoCtx) => Promise<SessionStatusRequestCandidate[]>;
	runtime: (ctx: IoCtx, terminalIds: string[]) => Promise<RuntimeProcessStatus[]>;
	requests: (ctx: IoCtx, sessionIds: string[]) => Promise<Map<string, SessionUpdateRequest | null>>;
	beginRequest: (ctx: IoCtx, sessionId: string, requestId: string) => Promise<SessionUpdateRequest | null>;
	setRequest: (
		ctx: IoCtx,
		input: { sessionId: string; requestId: string; state: "sent" | "failed"; error?: string },
	) => Promise<SessionUpdateRequest>;
	send: (ctx: IoCtx, input: SessionStatusRequestCandidate & { requestId: string; text: string }) => Promise<unknown>;
	requestId: () => string;
};

const dependencies: SessionStatusRequestDeps = {
	candidates: (ctx) => ctx.newTx(sessionStatusRequestCandidates),
	runtime: (ctx, terminalIds) => readRuntimeSessions(ctx.home, { ids: terminalIds }),
	requests: (ctx, sessionIds) =>
		ctx.newTx(async (tx) => {
			const requests = new Map<string, SessionUpdateRequest | null>();
			for (const sessionId of sessionIds) requests.set(sessionId, await getSessionUpdateRequest(tx, { sessionId }));
			return requests;
		}),
	beginRequest: (ctx, sessionId, requestId) =>
		ctx.newTx((tx) => beginSessionUpdateRequest(ctx.core, tx, { sessionId, requestId })),
	setRequest: (ctx, input) => ctx.newTx((tx) => setSessionUpdateRequestState(ctx.core, tx, input)),
	send: (ctx, input) => nativeHost(ctx.home).sendAtTurnBoundary(input.terminalId, input.text, input.requestId),
	requestId: randomUUID,
};

const active = (process: RuntimeProcessStatus | undefined) =>
	process?.status === "running" && process.controllable && process.activity?.state === "working";

const due = (request: SessionUpdateRequest | null, process: RuntimeProcessStatus, now: Date) => {
	const last = request?.requestedAt ?? process.activity?.workingSince ?? process.activity?.updatedAt;
	return last !== undefined && Date.parse(last) <= now.getTime() - SESSION_STATUS_REQUEST_INTERVAL_MS;
};

const failureText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const deliveryIsUnconfirmed = (error: unknown) =>
	error instanceof Error && "code" in error && error.code === "HARNESS_DELIVERY_UNKNOWN";

const failRequest = (
	ctx: IoCtx,
	deps: SessionStatusRequestDeps,
	candidate: SessionStatusRequestCandidate,
	request: SessionUpdateRequest,
	error: string,
) =>
	deps.setRequest(ctx, {
		sessionId: candidate.sessionId,
		requestId: request.requestId,
		state: "failed",
		error,
	});

const dispatchCandidate = async (
	ctx: IoCtx,
	deps: SessionStatusRequestDeps,
	candidate: SessionStatusRequestCandidate,
	process: RuntimeProcessStatus | undefined,
	initialRequest: SessionUpdateRequest | null,
) => {
	let request = initialRequest;
	if (request?.state === "sent") {
		if (process === undefined || process.status === "exited")
			await failRequest(ctx, deps, candidate, request, "The agent process ended before it saved the status update.");
		else if (!process.controllable)
			await failRequest(
				ctx,
				deps,
				candidate,
				request,
				"The agent input channel became unavailable before it saved the status update.",
			);
		else if (process?.activity?.state === "idle" && process.acknowledgedMessageIds.includes(request.requestId))
			await failRequest(
				ctx,
				deps,
				candidate,
				request,
				"The agent finished the status request without saving an update.",
			);
		return;
	}
	if (request?.state === "pending" && process?.acknowledgedMessageIds.includes(request.requestId)) {
		await deps.setRequest(ctx, {
			sessionId: candidate.sessionId,
			requestId: request.requestId,
			state: "sent",
		});
		return;
	}
	if (request?.state === "pending" && !active(process)) {
		await failRequest(ctx, deps, candidate, request, "The agent stopped before Trellis sent the status request.");
		return;
	}
	if (!active(process)) return;
	if (!(request !== null && sessionUpdateRequestIsOutstanding(request.state)) && !due(request, process!, ctx.now()))
		return;
	if (request?.state !== "pending") {
		const requestId = deps.requestId();
		request = await deps.beginRequest(ctx, candidate.sessionId, requestId);
		if (request === null) return;
	}
	try {
		await deps.send(ctx, {
			...candidate,
			requestId: request.requestId,
			text: sessionStatusRequestPrompt(candidate.sessionId, request.requestId),
		});
		await deps.setRequest(ctx, {
			sessionId: candidate.sessionId,
			requestId: request.requestId,
			state: "sent",
		});
	} catch (error) {
		if (deliveryIsUnconfirmed(error)) return;
		await failRequest(ctx, deps, candidate, request, failureText(error));
	}
};

export const prepareSessionStatusRequests = async (
	ctx: IoCtx,
	_input: unknown,
	deps: SessionStatusRequestDeps = dependencies,
) => {
	const candidates = await deps.candidates(ctx);
	if (candidates.length === 0) return { checked: 0 };
	const processes = new Map(
		(
			await deps.runtime(
				ctx,
				candidates.map((candidate) => candidate.terminalId),
			)
		).map((process) => [process.id, process]),
	);
	const requests = await deps.requests(
		ctx,
		candidates.map((candidate) => candidate.sessionId),
	);
	await Promise.all(
		candidates.map((candidate) =>
			dispatchCandidate(
				ctx,
				deps,
				candidate,
				processes.get(candidate.terminalId),
				requests.get(candidate.sessionId) ?? null,
			),
		),
	);
	return { checked: candidates.length };
};

export const finishSessionStatusRequests = (_ctx: IoCtx, _tx: unknown, input: { checked: number }) =>
	Promise.resolve(input);
