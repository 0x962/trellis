import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const text = (path: string) => readFileSync(join(root, path), "utf8");

type Step = { uses?: string; run?: string; "working-directory"?: string };
type Job = { "runs-on": string; if?: string; env?: Record<string, string>; steps: Step[] };

const jobs = () => (Bun.YAML.parse(text(".github/workflows/ci.yml")) as { jobs: Record<string, Job> }).jobs;

describe("ci.yml", () => {
	test("the e2e job installs Chromium on macOS and runs the Playwright suite", () => {
		const e2e = jobs().e2e!;
		expect(e2e["runs-on"]).toBe("macos-latest");
		expect(e2e).not.toHaveProperty("if");
		const runs = e2e.steps.map((step) => step.run ?? "");
		expect(e2e.steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun"))).toBe(true);
		expect(runs).toContain("bun install --frozen-lockfile");
		expect(runs.some((run) => run.includes("playwright install") && run.includes("chromium"))).toBe(true);
		expect(runs).toContain("bun run e2e");
	});

	// plan.md, Performance requirements: CI enforces the perf tests at 2.5
	// times the budget of Navid's Mac. turbo passes TRELLIS_* variables to a
	// task and filters out `CI`, so the factor has its own variable.
	test("the check job runs the perf suite at 2.5 times the budget", () => {
		const check = jobs().check!;
		expect(check.env?.TRELLIS_PERF_FACTOR).toBe("2.5");
		expect(check.steps.map((step) => step.run ?? "")).toContain("bun run check");
	});

	// plan.md, Database schema: CI fails when `drizzle-kit generate` leaves a
	// change under apps/server/drizzle/. `test -z` exits 1 on any output.
	test("the drizzle-diff job runs on every push and fails on a generated change", () => {
		const drizzle = jobs()["drizzle-diff"]!;
		expect(drizzle).not.toHaveProperty("if");
		const runs = drizzle.steps.map((step) => step.run ?? "");
		expect(runs).toContain("bun run db:generate");
		expect(runs).toContain('test -z "$(git status --porcelain apps/server/drizzle/)"');
		expect(runs.indexOf("bun run db:generate")).toBeLessThan(runs.findIndex((run) => run.startsWith("test -z")));
	});
});

// Every workspace is at 0.0.0 and `.changeset/config.json` puts them in one
// fixed group, so a minor changeset releases every workspace as 0.1.0.
describe("the 0.1.0 release", () => {
	const workspaces = ["apps", "packages"].flatMap((dir) =>
		readdirSync(join(root, dir))
			.filter((entry) => !entry.startsWith("."))
			.map((entry) => JSON.parse(text(join(dir, entry, "package.json"))) as { name: string; version: string }),
	);

	const changesets = readdirSync(join(root, ".changeset"))
		.filter((file) => file.endsWith(".md") && file !== "README.md")
		.map((file) => text(join(".changeset", file)));

	const bumps = (changeset: string) =>
		Object.fromEntries(
			[...(/^---\n([\s\S]*?)\n---/.exec(changeset)?.[1] ?? "").matchAll(/^"([^"]+)": (\w+)$/gm)].map((match) => [
				match[1],
				match[2],
			]),
		);

	test("a changeset releases every workspace from 0.0.0 as a minor bump", () => {
		const release = changesets.map(bumps).find((entries) => Object.keys(entries).length > 0)!;
		for (const workspace of workspaces) {
			expect(workspace.version, workspace.name).toBe("0.0.0");
			expect(release[workspace.name], workspace.name).toBe("minor");
		}
	});

	test("CHANGELOG.md has a 0.1.0 entry", () => {
		expect(text("CHANGELOG.md")).toMatch(/^## 0\.1\.0$/m);
	});
});
