import type { RuntimeMethods, RuntimeOutput, RuntimeProcessStatus, RuntimeStream } from "@trellis/runtime-protocol";
import type { SessionStore } from "./sessionStore.ts";

type OutputFrame = Omit<RuntimeOutput, "data"> & { data: string | Uint8Array };
type OutputStore<T extends OutputFrame> = Pick<SessionStore, "subscribe" | "inspect" | "outputComplete"> & {
	output: (id: string, offset: number, stream?: RuntimeStream) => T;
};

export async function outputSubscription<T extends OutputFrame>(
	store: OutputStore<T>,
	params: RuntimeMethods["subscribe"]["params"],
	send: (event: ({ type: "output" } & T) | { type: "session"; session: RuntimeProcessStatus }) => Promise<void>,
	signal: AbortSignal,
) {
	let offset = params.offset;
	let dirty = true;
	let sessionChanged = false;
	let wake: (() => void) | undefined;
	const notify = () => {
		dirty = true;
		wake?.();
	};
	const unsubscribe = store.subscribe(
		params.id,
		(change) => {
			if (change === "session") sessionChanged = true;
			notify();
		},
		params.stream,
		params.output,
	);
	signal.addEventListener("abort", notify);
	try {
		let session = store.inspect(params.id);
		await send({ type: "session", session });
		while (true) {
			signal.throwIfAborted();
			dirty = false;
			let outputSent = false;
			while (params.output !== false) {
				signal.throwIfAborted();
				const output = store.output(params.id, offset, params.stream);
				if (output.data.length === 0 && !output.truncated) break;
				await send({ type: "output", ...output });
				outputSent = true;
				offset = output.nextOffset;
			}
			if (sessionChanged) {
				sessionChanged = false;
				session = store.inspect(params.id);
				await send({ type: "session", session });
				outputSent = false;
			}
			if (session.status !== "running" && store.outputComplete(params.id)) {
				if (outputSent) await send({ type: "session", session });
				return;
			}
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
