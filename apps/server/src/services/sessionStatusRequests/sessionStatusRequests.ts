import { randomUUID } from "node:crypto";
import type { SessionUpdateRequest } from "@trellis/api";
import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import type { Tx } from "../../db/tx.ts";
import { requestStatusAtTurnBoundary, statusRequestProcesses, statusRequestRuns } from "../agentRuns.ts";
import { activeProjectIds } from "../projects.ts";
import { statusRequestSessions } from "../sessions";
import {
	beginSessionUpdateRequest,
	getSessionUpdateRequest,
	sessionUpdateRequestIsOutstanding,
	setSessionUpdateRequestState,
} from "../sessionUpdates";
import type { IoCtx } from "../support.ts";
import { incompleteTicketIds } from "../tickets.ts";

const SESSION_STATUS_REQUEST_INTERVAL_MS = 5 * 60 * 1000;

export type SessionStatusRequestCandidate = {
	runId: string;
	sessionRef: string;
	terminalId: string;
};

export const sessionStatusRequestCandidates = async (tx: Tx): Promise<SessionStatusRequestCandidate[]> => {
	const sessions = await statusRequestSessions(tx);
	const sessionByRun = new Map(sessions.map((session) => [session.runId, session.sessionId]));
	const runs = await statusRequestRuns(tx);
	const projectIds = [...new Set(runs.flatMap((run) => (run.projectId === null ? [] : [run.projectId])))];
	const ticketIds = [...new Set(runs.flatMap((run) => (run.ticketId === null ? [] : [run.ticketId])))];
	const activeProjects = new Set(projectIds.length === 0 ? [] : await activeProjectIds(tx, projectIds));
	const incompleteTickets = new Set(ticketIds.length === 0 ? [] : await incompleteTicketIds(tx, ticketIds));
	return runs
		.flatMap((run) => {
			const sessionRef = run.kind === "agent" ? run.id : sessionByRun.get(run.id);
			if (sessionRef === undefined) return [];
			if (run.projectId !== null && !activeProjects.has(run.projectId)) return [];
			if (run.kind === "agent" && (run.ticketId === null || !incompleteTickets.has(run.ticketId))) return [];
			return [{ runId: run.id, sessionRef, terminalId: run.terminalId }];
		})
		.sort((left, right) => left.runId.localeCompare(right.runId));
};

const sessionStatusRequestPrompt = (sessionRef: string, requestId: string) => `Provide a status update for this session.

Explain the purpose, actions, findings, uncertainty, and next step in useful prose. Use Markdown. You can include optional HTML files as embeds.

Save the Markdown reply with this exact command:

trellis session status write ${sessionRef} --request-id ${requestId} --body -

Pass the Markdown body on standard input. To attach HTML files, use this form:

trellis session status write ${sessionRef} --request-id ${requestId} --body - --embed report.html,details.html

Use one --embed flag with a comma-separated path list. Do not send the answer as chat text alone. A sent request is not a saved update. After the write succeeds, continue the assigned work.`;

export type SessionStatusRequestDeps = {
	candidates: (ctx: IoCtx) => Promise<SessionStatusRequestCandidate[]>;
	runtime: (ctx: IoCtx, terminalIds: string[]) => Promise<RuntimeProcessStatus[]>;
	requests: (ctx: IoCtx, runIds: string[]) => Promise<Map<string, SessionUpdateRequest | null>>;
	beginRequest: (ctx: IoCtx, runId: string, requestId: string) => Promise<SessionUpdateRequest | null>;
	setRequest: (
		ctx: IoCtx,
		input: { runId: string; requestId: string; state: "sent" | "failed"; error?: string },
	) => Promise<SessionUpdateRequest>;
	send: (ctx: IoCtx, input: SessionStatusRequestCandidate & { requestId: string; text: string }) => Promise<unknown>;
	requestId: () => string;
};

const dependencies: SessionStatusRequestDeps = {
	candidates: (ctx) => ctx.newTx(sessionStatusRequestCandidates),
	runtime: statusRequestProcesses,
	requests: (ctx, runIds) =>
		ctx.newTx(async (tx) => {
			const requests = new Map<string, SessionUpdateRequest | null>();
			for (const runId of runIds) requests.set(runId, await getSessionUpdateRequest(tx, { runId }));
			return requests;
		}),
	beginRequest: (ctx, runId, requestId) =>
		ctx.newTx((tx) => beginSessionUpdateRequest(ctx.core, tx, { runId, requestId })),
	setRequest: (ctx, input) => ctx.newTx((tx) => setSessionUpdateRequestState(ctx.core, tx, input)),
	send: (ctx, input) => requestStatusAtTurnBoundary(ctx, input),
	requestId: randomUUID,
};

const canReceiveStatusRequest = (process: RuntimeProcessStatus | undefined) =>
	process?.status === "running" && process.controllable && process.activity?.state === "working";

const statusRequestIsDue = (request: SessionUpdateRequest | null, process: RuntimeProcessStatus, now: Date) => {
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
		runId: candidate.runId,
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
			runId: candidate.runId,
			requestId: request.requestId,
			state: "sent",
		});
		return;
	}
	if (request?.state === "pending" && !canReceiveStatusRequest(process)) {
		await failRequest(ctx, deps, candidate, request, "The agent stopped before Trellis sent the status request.");
		return;
	}
	if (!canReceiveStatusRequest(process)) return;
	if (
		!(request !== null && sessionUpdateRequestIsOutstanding(request.state)) &&
		!statusRequestIsDue(request, process!, ctx.now())
	)
		return;
	if (request?.state !== "pending") {
		const requestId = deps.requestId();
		request = await deps.beginRequest(ctx, candidate.runId, requestId);
		if (request === null) return;
	}
	try {
		await deps.send(ctx, {
			...candidate,
			requestId: request.requestId,
			text: sessionStatusRequestPrompt(candidate.sessionRef, request.requestId),
		});
		await deps.setRequest(ctx, {
			runId: candidate.runId,
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
		candidates.map((candidate) => candidate.runId),
	);
	await Promise.all(
		candidates.map((candidate) =>
			dispatchCandidate(
				ctx,
				deps,
				candidate,
				processes.get(candidate.terminalId),
				requests.get(candidate.runId) ?? null,
			),
		),
	);
	return { checked: candidates.length };
};

export const finishSessionStatusRequests = (_ctx: IoCtx, _tx: unknown, input: { checked: number }) =>
	Promise.resolve(input);
