const MB = 1024 * 1024;
const encoder = new TextEncoder();

// A reader can fall behind by this many encoded bytes before `push` waits.
const STREAM_BUFFER_BYTES = 8 * MB;

export const pullStream = (produce: (push: (chunk: string) => Promise<void>) => Promise<void>) => {
	let started = false;
	let cancelled = false;
	let onPull: (() => void) | null = null;
	let onChunk: (() => void) | null = null;
	const settle = () => {
		onChunk?.();
		onChunk = null;
	};
	return new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				return new Promise<void>((resolve) => {
					onChunk = resolve;
					if (started) {
						onPull?.();
						onPull = null;
						return;
					}
					started = true;
					const push = async (chunk: string) => {
						controller.enqueue(encoder.encode(chunk));
						settle();
						if ((controller.desiredSize ?? 0) > 0) return;
						await new Promise<void>((next) => {
							onPull = next;
						});
						if (cancelled) throw new Error("The stream was cancelled before the producer finished.");
					};
					produce(push).then(
						() => {
							if (!cancelled) controller.close();
							settle();
						},
						(error: unknown) => {
							if (!cancelled) controller.error(error);
							settle();
						},
					);
				});
			},
			cancel() {
				cancelled = true;
				onPull?.();
			},
		},
		new ByteLengthQueuingStrategy({ highWaterMark: STREAM_BUFFER_BYTES }),
	);
};
