import { isDeepStrictEqual } from "node:util";
import { createEngineClient, type EngineClientOptions } from "../../../langflowHost";
import { GroupDeadlineScopeSchema, type GroupDeadlineRequest } from "../groupDeadlineContract";

const proofSchema = GroupDeadlineScopeSchema.omit({ occurrenceKey: true });

export function groupScopeReader(options: EngineClientOptions) {
	const client = createEngineClient(options);
	return async (input: GroupDeadlineRequest, capabilityId: string, signal: AbortSignal) => {
		const identity = input;
		const response = await client.request({
			method: "POST", path: "/trellis-v1/group-scopes/read", body: JSON.stringify(identity), capabilityId, signal,
		});
		if (response.state === "unknown") throw new Error("group_readback_unknown");
		if (response.status !== 200) throw new Error(`group_readback_failed:${response.status}`);
		const proof = proofSchema.parse(JSON.parse(new TextDecoder().decode(response.bytes)));
		const observed = {
			executionId: proof.executionId, publicationId: proof.publicationId, engineJobId: proof.engineJobId,
			engineEpoch: proof.engineEpoch, scopeVertexId: proof.scopeVertexId, occurrenceKey: proof.occurrence.occurrenceKey,
		};
		if (!isDeepStrictEqual(identity, observed)) throw new Error("group_readback_conflict");
		return GroupDeadlineScopeSchema.parse({ ...proof, occurrenceKey: proof.occurrence.occurrenceKey });
	};
}
