import { and, eq } from "drizzle-orm";
import { langflowNativeHandles, langflowWorkspaceObservations } from "../../../tables/langflowExecution";
import type { Tx } from "../../../tx";
import { lockExecution } from "../executions";

export type WorkspaceObservationIdentity = {
	executionId: string;
	stepId: string;
	attemptId: string;
	workspaceId: string;
};
export type WorkspaceObservation = WorkspaceObservationIdentity & {
	workspaceCommit: string | null;
	observedAt: Date;
};

export async function readWorkspaceObservation(tx: Tx, input: WorkspaceObservationIdentity) {
	const [row] = await tx
		.select()
		.from(langflowWorkspaceObservations)
		.where(
			and(
				eq(langflowWorkspaceObservations.executionId, input.executionId),
				eq(langflowWorkspaceObservations.stepId, input.stepId),
				eq(langflowWorkspaceObservations.attemptId, input.attemptId),
				eq(langflowWorkspaceObservations.workspaceId, input.workspaceId),
			),
		);
	return row ?? null;
}

export async function writeWorkspaceObservation(tx: Tx, input: WorkspaceObservation) {
	await lockExecution(tx, input);
	const [native] = await tx.select().from(langflowNativeHandles).where(eq(langflowNativeHandles.stepId, input.stepId));
	if (
		!native ||
		native.executionId !== input.executionId ||
		native.attemptId !== input.attemptId ||
		native.handle.workspaceId !== input.workspaceId
	)
		throw new Error("workspace_observation_identity_conflict");
	const [saved] = await tx
		.select()
		.from(langflowWorkspaceObservations)
		.where(eq(langflowWorkspaceObservations.stepId, input.stepId));
	if (saved) {
		if (
			saved.executionId !== input.executionId ||
			saved.attemptId !== input.attemptId ||
			saved.workspaceId !== input.workspaceId
		)
			throw new Error("workspace_observation_identity_conflict");
		const nextTime = input.observedAt.getTime();
		const previousTime = saved.observedAt.getTime();
		if (nextTime < previousTime) throw new Error("workspace_observation_older");
		if (nextTime === previousTime) {
			if (input.workspaceCommit !== null && input.workspaceCommit !== saved.workspaceCommit)
				throw new Error("workspace_observation_conflict");
			return saved;
		}
		const [updated] = await tx
			.update(langflowWorkspaceObservations)
			.set({
				workspaceCommit: input.workspaceCommit ?? saved.workspaceCommit,
				observedAt: input.observedAt,
			})
			.where(eq(langflowWorkspaceObservations.stepId, input.stepId))
			.returning();
		return updated!;
	}
	const [created] = await tx.insert(langflowWorkspaceObservations).values(input).returning();
	return created!;
}
