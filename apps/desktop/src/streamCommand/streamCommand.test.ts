import { expect, test } from "bun:test";
import { streamCommand } from "./streamCommand.ts";

test("the stream preserves UTF-8 bytes across writes", async () => {
	const chunks: string[] = [];
	await streamCommand(
		process.execPath,
		[
			"-e",
			`
		const { writeSync } = require("node:fs");
		for (const byte of Buffer.from("hello 終わり")) writeSync(1, Buffer.from([byte]));
	`,
		],
		(text) => chunks.push(text),
	);
	expect(chunks.join("")).toBe("hello 終わり");
});

test("a missing executable rejects", async () => {
	await expect(streamCommand("/does-not-exist/trellis", [], () => {})).rejects.toThrow();
});

test("a signal cannot produce a successful result", async () => {
	await expect(
		streamCommand(process.execPath, ["-e", 'process.kill(process.pid, "SIGTERM")'], () => {}),
	).rejects.toThrow("SIGTERM");
});
