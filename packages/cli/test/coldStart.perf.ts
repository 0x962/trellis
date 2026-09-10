import { expect, test } from "bun:test";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const helpRun = () => {
	const start = performance.now();
	const result = Bun.spawnSync(["bun", "src/index.ts", "--help"], { cwd: root, stdout: "pipe", stderr: "pipe" });
	const elapsed = performance.now() - start;
	expect(result.exitCode).toBe(0);
	return elapsed;
};

// CLI-05: the root module loads citty and nothing else, so the help of an
// agent shell command costs less than a network round trip.
test("cold start of --help from source takes under 300 ms", () => {
	helpRun();
	const runs = Array.from({ length: 5 }, helpRun).sort((a, b) => a - b);
	expect(runs[2]!).toBeLessThan(300);
});
