import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

// Runs one command in the workspace. CI=1 keeps jest and expo out of
// interactive mode.
const run = (command: string[]) => {
	const result = Bun.spawnSync(command, {
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CI: "1" },
	});
	const output = result.stdout.toString() + result.stderr.toString();
	if (result.exitCode !== 0) console.log(output);
	return { exitCode: result.exitCode, output };
};

// The component suite takes seconds, so it runs once and two tests read the
// same result.
let suite: ReturnType<typeof run> | undefined;
const componentSuite = () => {
	suite ??= run(["bun", "run", "test:native"]);
	return suite;
};

const componentTests = (dir: string) =>
	readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
		.filter((entry) => entry.endsWith(".test.tsx"))
		.map((entry) => join(dir, entry));

describe("build", () => {
	test("typecheck exits 0", () => {
		expect(run(["bun", "run", "typecheck"]).exitCode).toBe(0);
	}, 600_000);

	test("expo export for ios exits 0", () => {
		const out = mkdtempSync(join(tmpdir(), "trellis-export-"));
		expect(run(["bunx", "expo", "export", "--platform", "ios", "--output-dir", out]).exitCode).toBe(0);
		const metadata = JSON.parse(readFileSync(join(out, "metadata.json"), "utf8")) as {
			fileMetadata: { ios: { bundle: string } };
		};
		expect(existsSync(join(out, metadata.fileMetadata.ios.bundle))).toBe(true);
	}, 600_000);

	test("the jest-expo component suite exits 0", () => {
		const { exitCode, output } = componentSuite();
		expect(exitCode).toBe(0);
		const files = [...componentTests("app"), ...componentTests("src")];
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) expect(output).toContain(`PASS ${file}`);
	}, 600_000);

	// Jest prints this line when it has to kill a worker that still holds a
	// timer or a socket after its last test.
	test("the jest-expo component suite leaves no handle open", () => {
		expect(componentSuite().output).not.toContain("failed to exit gracefully");
	}, 600_000);
});
