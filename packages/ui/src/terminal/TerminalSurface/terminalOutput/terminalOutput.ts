import { type TerminalFrame, terminalChunk } from "../terminalChunk";

const batchLimit = 1024 * 1024;
const bufferLimit = 8 * batchLimit;

type Chunk = {
	bytes: Uint8Array;
	reset: boolean;
	nextOffset: number;
	complete: () => void;
};

type Options = {
	write: (bytes: Uint8Array, complete: () => void) => void;
	reset: () => void;
	schedule?: (callback: () => void) => number;
	cancel?: (id: number) => void;
};

export const terminalOutput = ({
	write,
	reset,
	schedule = requestAnimationFrame,
	cancel = cancelAnimationFrame,
}: Options) => {
	let pending: Chunk[] = [];
	let inFlight: Chunk[] = [];
	let replayWaiters: { offset: number; complete: () => void }[] = [];
	let pendingBytes = 0;
	let bufferedBytes = 0;
	let receivedOffset = 0;
	let parsedOffset = 0;
	let frameId: number | null = null;
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	const scheduleWrite = () => {
		if (disposed || inFlight.length || !pending.length) return;
		if (pendingBytes >= batchLimit) {
			if (frameId !== null) cancel(frameId);
			clearTimeout(flushTimer);
			frameId = null;
			flush();
		} else if (frameId === null) {
			const run = () => {
				if (frameId !== null) cancel(frameId);
				frameId = null;
				clearTimeout(flushTimer);
				flush();
			};
			frameId = schedule(run);
			// Hidden tabs pause animation frames. The timer lets parsed bytes release the transport's output window.
			flushTimer = setTimeout(run, 50);
		}
	};

	const flush = () => {
		if (disposed || inFlight.length || !pending.length) return;
		let byteLength = 0;
		let count = 0;
		for (const chunk of pending) {
			if (count && (chunk.reset || byteLength + chunk.bytes.length > batchLimit)) break;
			byteLength += chunk.bytes.length;
			count++;
		}
		const batch = pending.splice(0, count);
		inFlight = batch;
		pendingBytes -= byteLength;
		const bytes = new Uint8Array(byteLength);
		let cursor = 0;
		for (const chunk of batch) {
			bytes.set(chunk.bytes, cursor);
			cursor += chunk.bytes.length;
		}
		if (batch[0]!.reset) reset();
		write(bytes, () => {
			// xterm removes a parsed batch after its callback returns. Defer the next write until that removal completes.
			queueMicrotask(() => {
				if (disposed) return;
				parsedOffset = batch.at(-1)!.nextOffset;
				bufferedBytes -= byteLength;
				inFlight = [];
				for (const chunk of batch) chunk.complete();
				replayWaiters = replayWaiters.filter((waiter) => {
					if (waiter.offset > parsedOffset) return true;
					waiter.complete();
					return false;
				});
				scheduleWrite();
			});
		});
	};

	return {
		offset: () => parsedOffset,
		push(frame: TerminalFrame): Promise<void> {
			if (disposed) return Promise.resolve();
			const chunk = terminalChunk(frame, receivedOffset);
			if (!chunk.bytes.length) {
				if (frame.nextOffset <= parsedOffset || frame.nextOffset > receivedOffset) return Promise.resolve();
				return new Promise<void>((complete) => replayWaiters.push({ offset: frame.nextOffset, complete }));
			}
			if (bufferedBytes + chunk.bytes.length > bufferLimit)
				return Promise.reject(new Error("Terminal output exceeds the 8 MiB buffer. Reconnect to resume output."));
			receivedOffset = chunk.nextOffset;
			bufferedBytes += chunk.bytes.length;
			pendingBytes += chunk.bytes.length;
			const complete = new Promise<void>((resolve) => {
				for (let start = 0; start < chunk.bytes.length; start += batchLimit) {
					const end = Math.min(start + batchLimit, chunk.bytes.length);
					pending.push({
						bytes: chunk.bytes.subarray(start, end),
						reset: start === 0 && chunk.reset,
						nextOffset: chunk.nextOffset - chunk.bytes.length + end,
						complete: end === chunk.bytes.length ? resolve : () => {},
					});
				}
			});
			scheduleWrite();
			return complete;
		},
		dispose() {
			disposed = true;
			if (frameId !== null) cancel(frameId);
			clearTimeout(flushTimer);
			for (const chunk of [...inFlight, ...pending]) chunk.complete();
			for (const waiter of replayWaiters) waiter.complete();
			replayWaiters = [];
			inFlight = [];
			pending = [];
		},
	};
};
