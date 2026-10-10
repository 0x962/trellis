import type { EpicWhiteboardSnapshot } from "@trellis/api";

export type WhiteboardSaveState = { status: "idle" | "saving" | "saved" | "error"; error?: Error };

export function whiteboardSaveQueue({
	revision,
	save,
	onState,
}: {
	revision: number;
	save: (snapshot: EpicWhiteboardSnapshot, revision: number) => Promise<{ revision: number }>;
	onState: (state: WhiteboardSaveState) => void;
}) {
	let pending: EpicWhiteboardSnapshot | null = null;
	let inFlight = false;
	let failed = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const flush = async () => {
		clearTimeout(timer);
		if (inFlight || failed || pending === null) return;
		const snapshot = pending;
		pending = null;
		inFlight = true;
		onState({ status: "saving" });
		try {
			const result = await save(snapshot, revision);
			revision = result.revision;
		} catch (error) {
			failed = true;
			pending ??= snapshot;
			onState({ status: "error", error: error as Error });
		} finally {
			inFlight = false;
		}
		if (failed) return;
		if (pending !== null) void flush();
		else onState({ status: "saved" });
	};
	return {
		change: (snapshot: EpicWhiteboardSnapshot) => {
			pending = snapshot;
			if (failed) return;
			onState({ status: "saving" });
			clearTimeout(timer);
			timer = setTimeout(() => void flush(), 400);
		},
		flush,
		getRevision: () => revision,
	};
}
