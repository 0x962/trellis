import type { RuntimeClient } from "../../client.ts";
import type { LaunchSpec } from "../../index.ts";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { LaunchOutcome } from "../LaunchOutcome";
import { LaunchSpecMismatch } from "../LaunchSpecMismatch";

// Sends one `start` request and names its outcome. Two transport failures of
// the client leave the runtime state unknown: the RUNTIME_TIMEOUT error of a
// client with a socket timeout, and the "connection closed" error of a
// socket that closed before the reply. Both become a `LaunchUnknown`. Every
// other error, including LAUNCH_CONFLICT from the runtime, propagates.
// `descriptorFingerprint` runs only after the runtime answered, so an
// unknown outcome reads no file.
export async function startLaunch(
	client: Pick<RuntimeClient, "start">,
	target: ExecutionTarget,
	spec: LaunchSpec,
	descriptorFingerprint: () => Promise<string | null>,
): Promise<LaunchOutcome> {
	if (spec.id !== target.attemptId) throw new LaunchSpecMismatch(target.attemptId, spec.id);
	let session: Awaited<ReturnType<RuntimeClient["start"]>>;
	try {
		session = await client.start(spec);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if ((error as { code?: string }).code === "RUNTIME_TIMEOUT")
			return { kind: "unknown", target, reason: "timeout", message };
		if (message.endsWith("response is unknown: connection closed"))
			return { kind: "unknown", target, reason: "connection-closed", message };
		throw error;
	}
	return { kind: "receipt", target, session, descriptorFingerprint: await descriptorFingerprint() };
}
