import {
	type FlowDocumentSnapshotV1,
	type FlowExecutionStartInput,
	FlowExecutionStartInputSchema,
	type FlowPublicationV1,
} from "@trellis/api";
import { ulid } from "ulid";
import { requireActor, type ServiceCtx } from "../../context.ts";
import type { Tx } from "../../db/tx.ts";
import { invalidInput } from "../../errors.ts";
import { requestBytes } from "./requestBytes.ts";
import type { StartExecution, StartIdentity, StartStore } from "./store.ts";
import { submission } from "./submission.ts";
import { validateStart } from "./validateStart.ts";

export type StartDependencies = {
	hostId: string;
	store: StartStore;
	requireCurrentPublication: (
		ctx: ServiceCtx,
		tx: Tx,
		input: { flow: string; expectedVersion: number },
	) => Promise<{
		snapshot: FlowDocumentSnapshotV1;
		publication: FlowPublicationV1;
	}>;
};

export async function reserve(ctx: ServiceCtx, tx: Tx, input: FlowExecutionStartInput, deps: StartDependencies) {
	input = FlowExecutionStartInputSchema.parse(input);
	const actor = requireActor(ctx);
	if (actor.kind === "system") throw invalidInput("actor", "A person or an agent must request the flow start.");
	const identity: StartIdentity = { actorKind: actor.kind, actorName: actor.name, requestId: input.requestId };
	const bytes = requestBytes(input);
	const prior = await deps.store.readRequest(tx, identity);
	if (prior) {
		if (prior.requestBytes !== bytes)
			throw invalidInput("requestId", "This request identifier already names a different flow start.");
		return { execution: await deps.store.read(tx, prior), disposition: "reused" as const };
	}
	const { ticket, flow, diffId, currentHead } = await validateStart(ctx, tx, input);
	const last = diffId === null ? null : await deps.store.latest(tx, { flowId: flow.id, diffId });
	if (last && !input.allowRepeat && !(last.status === "failed" && last.failureKind === "error")) {
		const receipt = await deps.store.saveRequest(tx, {
			...identity,
			requestBytes: bytes,
			executionId: last.execution.executionId,
		});
		return { execution: await deps.store.read(tx, receipt), disposition: "reused" as const };
	}
	if (diffId !== null && (currentHead === null || input.headSha !== currentHead))
		throw invalidInput("headSha", "Refresh the diff and supply its current head before a new run.");
	if (diffId === null && input.headSha !== undefined)
		throw invalidInput("headSha", "A reviewed head requires a linked diff.");
	const { snapshot, publication } = await deps.requireCurrentPublication(ctx, tx, {
		flow: flow.id,
		expectedVersion: input.expectedVersion,
	});
	const executionId = ulid();
	const submitted = submission({
		executionId,
		hostId: deps.hostId,
		actor: { kind: actor.kind, name: actor.name },
		requestId: input.requestId,
		requestBytes: bytes,
		publication,
		snapshot,
	});
	const execution: StartExecution = {
		engine: "langflow",
		executionId,
		flowId: flow.id,
		ticketId: ticket.id,
		projectId: ticket.projectId,
		diffId,
		reviewedHead: input.headSha ?? null,
		repeatOf: last?.execution.executionId ?? null,
		repeatReason: input.repeatReason ?? null,
		publicationId: publication.publicationId,
		publication,
		snapshot,
		hostId: deps.hostId,
		requestBytes: bytes,
		...submitted,
		correlation: null,
		admission: submitted.submission.admission,
		authority: null,
		createdAt: ctx.now,
		canceled: false,
	};
	const saved = await deps.store.reserve(tx, { ...execution, ...identity });
	const receipt = await deps.store.saveRequest(tx, {
		...identity,
		requestBytes: bytes,
		executionId: saved.executionId,
	});
	ctx.emit({ type: "flows.changed", id: flow.id });
	return { execution: await deps.store.read(tx, receipt), disposition: "queued" as const };
}
