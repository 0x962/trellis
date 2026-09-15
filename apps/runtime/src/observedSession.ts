import type { RuntimeProcessStatus, RuntimeSession } from "@trellis/runtime-protocol";
import type { ProcessObservation } from "./inspectProcess.ts";

type Observed = Pick<RuntimeProcessStatus, "status" | "controllable" | "process" | "error">;
export function observedSession(
	session: RuntimeSession,
	identity: string | null,
	observation: ProcessObservation,
	owned: boolean,
): Observed {
	const base = { controllable: false, process: null, error: session.error };
	if (observation.kind === "unknown") return { ...base, status: "unknown", error: observation.error };
	if (observation.kind === "missing") {
		const incompleteLaunch = session.pid === null && session.endedAt === null;
		return { ...base, status: owned || incompleteLaunch ? "unknown" : "exited" };
	}
	if (identity === null) return { ...base, status: "unknown", error: "The saved process has no kernel identity" };
	if (identity !== observation.process.identity) return { ...base, status: "exited" };
	return { ...base, status: "running", controllable: owned, process: observation.process };
}
