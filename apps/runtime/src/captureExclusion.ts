import type { RuntimeLaunchWriterScope } from "@trellis/runtime-protocol";
import {
	readRuntimeCaptureHolds,
	runtimeCaptureHoldOverlaps,
} from "@trellis/runtime-protocol/mutation-exclusion";

const captureHeld = (message: string) => Object.assign(new Error(message), { code: "CAPTURE_HELD" });
const captureUnavailable = (message: string) => Object.assign(new Error(message), { code: "CAPTURE_UNAVAILABLE" });

export class CaptureExclusion {
	private readonly captures = new Set<string>();
	private readonly mutations = new Map<string, number>();

	assertWritable(id: string) {
		if (this.captures.has(id)) throw captureHeld(`Session ${id} is held by a capture snapshot`);
	}

	assertLaunchWritable(dataHome: string, id: string, scopes?: RuntimeLaunchWriterScope[]) {
		this.assertWritable(id);
		for (const hold of readRuntimeCaptureHolds(dataHome)) {
			if (hold.global || hold.attemptIds.includes(id))
				throw captureHeld(`Capture ${hold.captureId} holds this runtime launch`);
			if (scopes === undefined) throw captureUnavailable(`Capture ${hold.captureId} cannot prove this launch is unrelated`);
			if (runtimeCaptureHoldOverlaps(hold, scopes))
				throw captureHeld(`Capture ${hold.captureId} holds this runtime launch scope`);
		}
	}

	async mutate<T>(id: string, action: () => Promise<T>): Promise<T> {
		this.assertWritable(id);
		this.mutations.set(id, (this.mutations.get(id) ?? 0) + 1);
		try {
			return await action();
		} finally {
			const remaining = this.mutations.get(id)! - 1;
			if (remaining === 0) this.mutations.delete(id);
			else this.mutations.set(id, remaining);
		}
	}

	async capture<T>(ids: string[], action: () => Promise<T>): Promise<T> {
		for (const id of ids) {
			if (this.captures.has(id)) throw captureHeld(`Session ${id} is held by another capture snapshot`);
			if (this.mutations.has(id)) throw captureUnavailable(`Session ${id} has an active mutation`);
		}
		for (const id of ids) this.captures.add(id);
		try {
			return await action();
		} finally {
			for (const id of ids) this.captures.delete(id);
		}
	}
}
