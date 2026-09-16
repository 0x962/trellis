import { expect, test } from "bun:test";
import { terminalOutput } from "./terminalOutput";

const frame = (text: string, startOffset: number) => {
	const data = new TextEncoder().encode(text);
	return { data, startOffset, nextOffset: startOffset + data.length, truncated: false };
};

const fixture = () => {
	let scheduled: (() => void) | undefined;
	const writes: { bytes: Uint8Array; done: () => void }[] = [];
	let resets = 0;
	const output = terminalOutput({
		write: (bytes, done) => writes.push({ bytes, done }),
		reset: () => resets++,
		schedule: (callback) => {
			scheduled = callback;
			return 1;
		},
		cancel: () => {
			scheduled = undefined;
		},
	});
	return {
		output,
		writes,
		resets: () => resets,
		flush: () => {
			const callback = scheduled;
			scheduled = undefined;
			callback?.();
		},
	};
};

test("terminal output combines a burst and commits byte offsets after the parser completes", async () => {
	const { output, writes, flush } = fixture();
	const first = output.push(frame("work ", 0));
	const second = output.push(frame("✓", 5));
	expect(writes).toHaveLength(0);
	expect(output.offset()).toBe(0);
	flush();
	expect(writes).toHaveLength(1);
	expect(new TextDecoder().decode(writes[0]!.bytes)).toBe("work ✓");
	expect(output.offset()).toBe(0);
	writes[0]!.done();
	await Promise.all([first, second]);
	expect(output.offset()).toBe(8);
});

test("terminal output waits for the parser and skips replay bytes already queued", async () => {
	const { output, writes, flush } = fixture();
	const first = output.push(frame("abc", 0));
	flush();
	const second = output.push(frame("abcdef", 0));
	flush();
	expect(writes).toHaveLength(1);
	writes[0]!.done();
	await first;
	flush();
	expect(writes).toHaveLength(2);
	expect(new TextDecoder().decode(writes[1]!.bytes)).toBe("def");
	writes[1]!.done();
	await second;
	expect(output.offset()).toBe(6);
});

test("terminal output resets a retained gap only after earlier writes finish", async () => {
	const { output, writes, flush, resets } = fixture();
	const first = output.push(frame("abc", 0));
	const second = output.push(frame("tail", 90));
	flush();
	expect(resets()).toBe(0);
	expect(new TextDecoder().decode(writes[0]!.bytes)).toBe("abc");
	writes[0]!.done();
	await first;
	flush();
	expect(resets()).toBe(1);
	expect(new TextDecoder().decode(writes[1]!.bytes)).toBe("tail");
	writes[1]!.done();
	await second;
	expect(output.offset()).toBe(94);
});

test("terminal output bounds parser batches and rejects an excessive backlog without dropping accepted bytes", async () => {
	const { output, writes, flush } = fixture();
	const data = new Uint8Array(8 * 1024 * 1024).fill(65);
	const accepted = output.push({ data, startOffset: 0, nextOffset: data.length, truncated: false });
	expect(writes).toHaveLength(1);
	await expect(output.push(frame("overflow", data.length))).rejects.toThrow("Terminal output exceeds the 8 MiB buffer");
	for (let index = 0; index < 8; index++) {
		expect(writes[index]!.bytes.length).toBe(1024 * 1024);
		writes[index]!.done();
		await Promise.resolve();
		flush();
	}
	await accepted;
	expect(output.offset()).toBe(data.length);
	expect(writes).toHaveLength(8);
});

test("terminal output disposal releases pending callbacks and cancels future writes", async () => {
	const { output, writes, flush } = fixture();
	const pending = output.push(frame("abc", 0));
	output.dispose();
	flush();
	await pending;
	expect(writes).toHaveLength(0);
	expect(output.offset()).toBe(0);
});

test("a full batch flushes even when the browser delays the scheduled animation frame", async () => {
	const { output, writes, flush } = fixture();
	const first = output.push(frame("a", 0));
	const data = new Uint8Array(1024 * 1024 - 1);
	const second = output.push({ data, startOffset: 1, nextOffset: data.length + 1, truncated: false });
	expect(writes).toHaveLength(1);
	flush();
	expect(writes).toHaveLength(1);
	writes[0]!.done();
	await Promise.all([first, second]);
});
