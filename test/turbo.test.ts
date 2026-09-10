import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const text = (relativePath: string) => Bun.file(join(root, relativePath)).text();

describe("turbo.json", () => {
	// turbo runs a task in strict env mode: a variable that turbo.json does not
	// list never reaches the task. `bun run dev` starts the server and vite
	// through turbo, so every TRELLIS_* variable they read must pass through.
	test("turbo passes every TRELLIS_* variable of the server and vite configs to dev", async () => {
		const { globalPassThroughEnv } = JSON.parse(await text("turbo.json")) as { globalPassThroughEnv: string[] };
		const covers = (name: string) =>
			globalPassThroughEnv.some((entry) =>
				entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : entry === name,
			);
		const sources = await Promise.all(["apps/server/src/config.ts", "apps/web/vite.config.ts"].map(text));
		const names = new Set(
			sources.flatMap((source) => [...source.matchAll(/env\.(TRELLIS_[A-Z_]+)/g)].map((m) => m[1]!)),
		);

		expect(names).toContain("TRELLIS_API_URL");
		expect(names).toContain("TRELLIS_GH_BIN");
		expect([...names].filter((name) => !covers(name))).toEqual([]);
	});
});
