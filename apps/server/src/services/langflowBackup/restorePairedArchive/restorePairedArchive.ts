import type { SnapshotCompatibility } from "../manifest";
import { restorePairedSnapshot } from "../restorePairedSnapshot";
import { withPairedArchive } from "../withPairedArchive";

export function restorePairedArchive(
	ctx: { liveHome: string },
	input: {
		archive: string;
		destination: string;
		targetHome: string;
		requestId: string;
		compatibility: SnapshotCompatibility;
		signal: AbortSignal;
	},
) {
	return withPairedArchive(ctx, input, (snapshot) => restorePairedSnapshot(ctx, {
		snapshot: snapshot.directory,
		destination: input.destination,
		targetHome: input.targetHome,
		requestId: input.requestId,
		compatibility: input.compatibility,
		signal: input.signal,
	}));
}
