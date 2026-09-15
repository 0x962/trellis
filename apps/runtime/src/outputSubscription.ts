import type { RuntimeMethods, RuntimeOutputEvent } from "@trellis/runtime-protocol";
import type { SessionStore } from "./sessionStore.ts";

type OutputStore = Pick<SessionStore, "subscribe" | "output" | "inspect" | "outputComplete">;

export async function outputSubscription(
	store: OutputStore,
	params: RuntimeMethods["subscribe"]["params"],
	send: (event: RuntimeOutputEvent) => Promise<void>,
	signal: AbortSignal,
) {
	let offset = params.offset;
	let dirty = true;
	let wake: (() => void) | undefined;
	const notify = () => {
		dirty = true;
		wake?.();
	};
	const unsubscribe = store.subscribe(params.id, notify, params.stream);
	signal.addEventListener("abort", notify);
	try {
		await send({ type: "session", session: store.inspect(params.id) });
		while (true) {
			signal.throwIfAborted();
			dirty = false;
			while (true) {
				signal.throwIfAborted();
				const output = store.output(params.id, offset, params.stream);
				if (output.data === "" && !output.truncated) break;
				await send({ type: "output", ...output });
				offset = output.nextOffset;
			}
			const session = store.inspect(params.id);
			await send({ type: "session", session });
			if (session.status !== "running" && store.outputComplete(params.id)) return;
			if (!dirty)
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			wake = undefined;
		}
	} finally {
		unsubscribe();
		signal.removeEventListener("abort", notify);
	}
}
