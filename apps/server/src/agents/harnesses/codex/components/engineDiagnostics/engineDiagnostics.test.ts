import { afterEach, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { scratchHome } from "../../../bridgeTestFixtures/index.ts";
import type { HarnessEvent } from "../../../types.ts";
import { CodexAppServerEvents } from "../../appServerEvents.ts";
import { recordEngineDiagnostics } from "./engineDiagnostics.ts";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("engine logs retain exact bytes and keep compaction updates through mixed diagnostic lines", async () => {
	const home = await scratchHome(cleanups);
	const path = join(home, "codex-engine.log");
	const input = new PassThrough();
	const parser = new CodexAppServerEvents("thread-1");
	parser.parse({ method: "turn/started", params: { threadId: "thread-1", turn: { id: "turn-1" } } });
	const observed: HarnessEvent[] = [];
	const finished = recordEngineDiagnostics(input, path, (entry) => observed.push(...parser.compactionProgress(entry)));
	const progress = JSON.stringify({
		target: "codex_api::sse::responses",
		fields: { message: 'unhandled responses event: "response.compaction.compacting"' },
		spans: [{ name: "turn", "thread.id": "thread-1", "turn.id": "turn-1" }],
	});
	const bytes = Buffer.from(`plain diagnostic\r\n{invalid JSON\n{"message":"café"}\n${progress}\nfinal diagnostic`);
	const split = bytes.indexOf(Buffer.from("é")) + 1;
	input.write(bytes.subarray(0, split));
	input.end(bytes.subarray(split));
	await finished;

	expect(await readFile(path)).toEqual(bytes);
	expect((await stat(path)).mode & 0o777).toBe(0o600);
	expect(observed).toEqual([
		{
			kind: "tool-update",
			sessionId: "thread-1",
			turnId: "turn-1",
			tool: { id: "compaction:turn-1", name: "Compact" },
		},
	]);
});

test("an unavailable diagnostic file reports the write error", async () => {
	const home = await scratchHome(cleanups);
	const input = new PassThrough();
	const finished = recordEngineDiagnostics(input, join(home, "missing", "codex-engine.log"), () => {});
	const refused = expect(finished).rejects.toMatchObject({ code: "ENOENT" });
	input.end("diagnostic");
	await refused;
});
