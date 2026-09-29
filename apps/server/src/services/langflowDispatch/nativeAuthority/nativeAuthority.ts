import { assertAuthority, lockExecution } from "../../../db/queries/langflowExecution";
import type { Tx } from "../../../db/tx";
import { NativeRequestV1Schema, readProtocolBytes } from "../../../langflowContracts";
import { LangflowHostControl, type LiveOwnership } from "../../../langflowHost";
import type { IoCtx } from "../../support";

export type NativeAuthorityInput = {
	requestBytes: string;
	capabilityId: string;
	observation: LiveOwnership;
};

export async function nativeAuthority(ctx: IoCtx, tx: Tx, input: NativeAuthorityInput) {
	if (ctx.actor.kind !== "system") throw new Error("langflow_internal_authority_required");
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const current = LangflowHostControl.readIdentity(ctx.home);
	const observed = input.observation.identity;
	if (current.dataHomeId !== observed.dataHomeId || current.hostId !== observed.hostId)
		throw new Error("langflow_bootstrap_identity_changed");
	const execution = await lockExecution(tx, request);
	const authority = execution.authority;
	if (
		authority === null ||
		authority.capabilityId !== input.capabilityId ||
		authority.hostId !== observed.hostId ||
		authority.ownerId !== observed.ownerId ||
		authority.executionId !== request.executionId ||
		authority.publicationId !== request.publicationId ||
		authority.engineJobId !== request.engineJobId ||
		execution.hostId !== observed.hostId
	)
		throw new Error("native_authority_conflict");
	await assertAuthority(tx, execution, authority, "native.reserve", ctx.now());
	return authority;
}
