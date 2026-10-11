import type { RuntimeSession } from "../../index.ts";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { LaunchOutcome } from "../LaunchOutcome";

// Runs one launch and names its outcome. `run` sends the request to the
// runtime and answers with the session. Two transport failures of the client
// leave the runtime state unknown: the RUNTIME_TIMEOUT error of a client
// with a socket timeout, and the "connection closed" error of a socket that
// closed before the reply. Both become a `LaunchUnknown`. Every other error,
// including LAUNCH_CONFLICT from the runtime, propagates.
// `descriptorDigest` runs only after the runtime answered, so an unknown
// outcome reads no file.
export async function runLaunch(
	target: ExecutionTarget,
	run: () => Promise<RuntimeSession>,
	descriptorDigest: () => Promise<string | null>,
): Promise<LaunchOutcome> {
	let session: RuntimeSession;
	try {
		session = await run();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if ((error as { code?: string }).code === "RUNTIME_TIMEOUT")
			return { kind: "unknown", target, reason: "timeout", message };
		if (message.endsWith("response is unknown: connection closed"))
			return { kind: "unknown", target, reason: "connection-closed", message };
		throw error;
	}
	return { kind: "receipt", target, session, descriptorDigest: await descriptorDigest() };
}
