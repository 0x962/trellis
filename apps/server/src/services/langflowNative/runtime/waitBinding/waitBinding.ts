import { isDeepStrictEqual } from "node:util";
import { ExternalWaitV1Schema, NativeRequestV1Schema, readProtocolBytes } from "../../../../langflowContracts";
import type { NativeHandleV1 } from "../../../../langflowContracts";

export function readNativeWait(input: { requestBytes: string; waitBytes: string; handle: NativeHandleV1 }) {
	const request = readProtocolBytes(NativeRequestV1Schema, input.requestBytes);
	const wait = readProtocolBytes(ExternalWaitV1Schema, input.waitBytes);
	if (wait.kind !== "native" || !isDeepStrictEqual(wait.request, request) ||
		wait.handle.stepId !== input.handle.stepId || wait.handle.agentRunId !== input.handle.agentRunId ||
		wait.handle.attemptId !== input.handle.attemptId ||
		(wait.handle.providerSessionId !== null && wait.handle.providerSessionId !== input.handle.providerSessionId))
		throw new Error("native_wait_binding_conflict");
	return wait;
}
