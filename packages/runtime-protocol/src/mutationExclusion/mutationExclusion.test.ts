import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { orderRuntimeMutationScopes, withRuntimeMutationExclusion } from "./mutationExclusion.ts";

describe("runtime mutation exclusion", () => {
	test("uses one lock order for every writer", () => {
		expect(
			orderRuntimeMutationScopes([
				{ kind: "repository", directory: "/repo/.git" },
				{ kind: "attempt", directory: "/home/harness-attempts/b" },
				{ kind: "workspace", directory: "/home/agents/b/work" },
				{ kind: "attempt-retention", directory: "/home/harness-attempts" },
				{ kind: "provider", directory: "/profiles/account" },
				{ kind: "attempt", directory: "/home/harness-attempts/a" },
			]),
		).toEqual([
			{ kind: "workspace", directory: "/home/agents/b/work" },
			{ kind: "provider", directory: "/profiles/account" },
			{ kind: "attempt-retention", directory: "/home/harness-attempts" },
			{ kind: "attempt", directory: "/home/harness-attempts/a" },
			{ kind: "attempt", directory: "/home/harness-attempts/b" },
			{ kind: "repository", directory: "/repo/.git" },
		]);
	});

	test("releases the file lock after success and failure", async () => {
		const home = await mkdtemp(join(tmpdir(), "trellis-runtime-lock-"));
		const scope = { kind: "workspace" as const, directory: join(home, "work") };
		try {
			await withRuntimeMutationExclusion(home, [scope], async () => {});
			await expect(
				withRuntimeMutationExclusion(home, [scope], async () => {
					throw new Error("fixture failure");
				}),
			).rejects.toThrow("fixture failure");
			await withRuntimeMutationExclusion(home, [scope], async () => {});
		} finally {
			await rm(home, { recursive: true, force: true });
		}
	});
});
