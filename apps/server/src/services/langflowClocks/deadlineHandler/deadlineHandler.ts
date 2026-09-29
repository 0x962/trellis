import { isDeepStrictEqual } from "node:util";
import { GroupDeadlineRequestSchema, GroupDeadlineResultSchema, GroupDeadlineScopeSchema,
	type GroupDeadlineRequest, type GroupDeadlineResult, type GroupDeadlineScope } from "../groupDeadlineContract";

export type DeadlineHandlerDependencies = {
	withAuthenticatedNativeReservation<T>(authorization: string | null, action: () => Promise<T>): Promise<T>;
	readGroupScope(request: GroupDeadlineRequest, capabilityId: string, signal: AbortSignal): Promise<GroupDeadlineScope>;
	reserve(input: { request: GroupDeadlineScope; capabilityId: string }): Promise<GroupDeadlineResult>;
};

export function deadlineHandler(deps: DeadlineHandlerDependencies) {
	return (request: Request) => deps.withAuthenticatedNativeReservation(request.headers.get("authorization"), async () => {
		const capabilityId = request.headers.get("x-trellis-capability-id");
		if (!capabilityId) throw new Error("authority_conflict");
		const input = GroupDeadlineRequestSchema.parse(await request.json());
		const retained = GroupDeadlineScopeSchema.parse(await deps.readGroupScope(input, capabilityId, request.signal));
		const identity = GroupDeadlineRequestSchema.parse({
			executionId: retained.executionId, publicationId: retained.publicationId,
			engineJobId: retained.engineJobId, engineEpoch: retained.engineEpoch, scopeVertexId: retained.scopeVertexId,
			occurrenceKey: retained.occurrenceKey,
		});
		if (!isDeepStrictEqual(input, identity)) throw new Error("group_readback_conflict");
		const result = await deps.reserve({ request: retained, capabilityId });
		return Response.json(GroupDeadlineResultSchema.parse(result));
	});
}
