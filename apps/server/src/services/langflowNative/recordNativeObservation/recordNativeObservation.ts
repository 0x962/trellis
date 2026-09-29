import type { RuntimeProcessStatus } from "@trellis/runtime-protocol";
import { eq, sql } from "drizzle-orm";
import type { ServiceCtx } from "../../../context";
import { lockExecution } from "../../../db/queries/langflowExecution/executions";
import { recordCompletion, updateNativeHandle } from "../../../db/queries/langflowExecution/native";
import { rows } from "../../../db/queries/support";
import { langflowCompletions } from "../../../db/tables/langflowExecution";
import type { Tx } from "../../../db/tx";
import { NativeHandleV1Schema } from "../../../langflowContracts";
import { readReservation } from "../readReservation";
import { observedCompletion } from "./components/observedCompletion";

type WorkspaceObservation = {
	executionId: string;
	stepId: string;
	attemptId: string;
	workspaceId: string;
	workspaceCommit: string | null;
};

type ObservationCtx = ServiceCtx & {
	recordWorkspace: (tx: Tx, observation: WorkspaceObservation) => Promise<void>;
};

export async function recordNativeObservation(
	ctx: ObservationCtx,
	tx: Tx,
	input: { executionId: string; stepId: string; runtime: RuntimeProcessStatus; workspaceCommit: string | null },
) {
	const execution = await lockExecution(tx, input);
	const reserved = await readReservation(tx, input);
	const runtime = input.runtime;
	if (runtime.id !== reserved.attemptId) throw new Error("native_attempt_conflict");
	const [prior] = await tx.select().from(langflowCompletions).where(eq(langflowCompletions.stepId, reserved.stepId));
	if (prior) {
		if (
			runtime.result &&
			(runtime.result.id !== prior.resultId || runtime.result.text !== prior.completion.result.output)
		)
			throw new Error("identity_conflict");
		return { handle: reserved.handle, completion: prior, reason: null };
	}
	const sessionId = runtime.agent?.sessionId ?? null;
	if (
		reserved.handle.providerSessionId !== null &&
		sessionId !== null &&
		reserved.handle.providerSessionId !== sessionId
	)
		throw new Error("native_session_conflict");
	const [run] = await rows<{ id: string; terminalId: string; sessionId: string | null; workspacePath: string | null }>(
		tx,
		sql`UPDATE agent_runs SET session_id=COALESCE(session_id,${sessionId})
		WHERE id=${reserved.agentRunId} AND terminal_id=${reserved.attemptId}
		AND (${sessionId}::text IS NULL OR session_id IS NULL OR session_id=${sessionId})
		RETURNING id,terminal_id AS "terminalId",session_id AS "sessionId",workspace_id AS "workspacePath"`,
	);
	if (!run) throw new Error("native_attempt_conflict");
	// agent_runs retains the local path. The protocol uses the stable run identity to reference that workspace.
	const workspaceId = run.workspacePath === null ? null : `workspace:${run.id}`;
	const candidate = NativeHandleV1Schema.parse({
		...reserved.handle,
		workspaceId: reserved.handle.workspaceId ?? workspaceId,
		providerSessionId: reserved.handle.providerSessionId ?? sessionId,
	});
	const observed = observedCompletion({ provenance: reserved.provenance, handle: candidate, runtime, run });
	const state = execution.cancelIntent ? "canceled" : observed.state === "completed" ? "succeeded" : observed.state;
	const handle = await updateNativeHandle(tx, {
		executionId: execution.executionId,
		expectedRevision: reserved.handle.revision,
		handle: { ...candidate, state, revision: reserved.handle.revision + 1 },
	});
	if (workspaceId !== null)
		await ctx.recordWorkspace(tx, {
			executionId: execution.executionId,
			stepId: reserved.stepId,
			attemptId: reserved.attemptId,
			workspaceId,
			workspaceCommit: input.workspaceCommit,
		});
	if (observed.state !== "completed")
		return { handle, completion: null, reason: "reason" in observed ? observed.reason : null };
	const completion = await recordCompletion(tx, {
		resultBytes: observed.resultBytes,
		completion: { ...observed.completion, handle },
	});
	return { handle, completion, reason: null };
}
