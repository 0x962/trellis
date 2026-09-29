import type { SnapshotMetadata } from "../manifest";
import { sealSnapshot } from "../sealSnapshot";

export type PreparedSnapshot = { directory: string; metadata: SnapshotMetadata };

export type CaptureContext = {
	withQuiescedSnapshot<T>(consume: (snapshot: PreparedSnapshot) => Promise<T>): Promise<T>;
};

export async function captureSnapshot(ctx: CaptureContext) {
	return ctx.withQuiescedSnapshot(async (snapshot) => ({
		directory: snapshot.directory,
		manifest: await sealSnapshot(snapshot),
	}));
}
