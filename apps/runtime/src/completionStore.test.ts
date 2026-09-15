import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CompletionStore } from "./completionStore.ts";

test("completion records retain each result and recover the latest result", () => {
	const home = mkdtempSync("/tmp/trl-results-");
	try {
		const path = join(home, "results.jsonl");
		const results = new CompletionStore(path);
		expect(results.latest).toBeNull();
		results.append("First result");
		const first = results.latest;
		results.append("Second result");
		expect(results.latest?.id).not.toBe(first?.id);
		expect(new CompletionStore(path).latest).toEqual(results.latest);
		expect(
			readFileSync(path, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line).text),
		).toEqual(["First result", "Second result"]);
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
