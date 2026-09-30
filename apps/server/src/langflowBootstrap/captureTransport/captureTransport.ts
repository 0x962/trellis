import { systemContext } from "../../context";
import type { ServiceTransport } from "../../db/transport";
import type { PairedCaptureContext, TrellisSealResult, TrellisSnapshotVersion } from "../../services/langflowBackup";

export function captureTransport(
	transport: Pick<ServiceTransport, "call">,
): Pick<PairedCaptureContext, "readTrellisVersion" | "captureTrellisAndSeal"> {
	return {
		readTrellisVersion: () =>
			transport.call("langflowBackup.readTrellisVersion", systemContext(), {}) as Promise<TrellisSnapshotVersion>,
		captureTrellisAndSeal: (input) =>
			transport.call("langflowBackup.captureTrellisAndSeal", systemContext(), input) as Promise<TrellisSealResult>,
	};
}
