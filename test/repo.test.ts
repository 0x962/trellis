import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import bunfig from "../bunfig.toml";
import { checkTasks } from "../scripts/check";

// Each test reads one root file and checks the fields plan.md names for it.
// A missing file throws ENOENT, so the failure names the file to create.
const root = join(import.meta.dir, "..");

const json = (relativePath: string) => Bun.file(join(root, relativePath)).json();
const text = (relativePath: string) => Bun.file(join(root, relativePath)).text();

type RestrictedImportRule = {
	options: {
		paths?: Record<string, string | { message: string }>;
		patterns?: Array<{ group: string[]; message: string }>;
	};
};

// Biome takes restricted imports in two shapes: `paths` keyed by specifier and
// `patterns` grouped by glob. Both collapse to one map from specifier to message.
const restrictedImportMessages = (biome: {
	linter: { rules: Record<string, Record<string, RestrictedImportRule>> };
}) => {
	const group = Object.values(biome.linter.rules).find((rules) => rules.noRestrictedImports);
	const { paths = {}, patterns = [] } = group!.noRestrictedImports!.options;
	const messages = new Map<string, string>();
	for (const [specifier, value] of Object.entries(paths)) {
		messages.set(specifier, typeof value === "string" ? value : value.message);
	}
	for (const pattern of patterns) {
		for (const specifier of pattern.group) {
			messages.set(specifier, pattern.message);
		}
	}
	return messages;
};

describe("root scaffold", () => {
	test("package.json names the workspace globs and pins bun as the package manager", async () => {
		const pkg = await json("package.json");
		expect(pkg.name).toBe("trellis");
		expect(pkg.private).toBe(true);
		expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
		expect(pkg.packageManager).toStartWith("bun@1.3");
	});

	test("package.json declares every root script from the plan", async () => {
		const { scripts } = await json("package.json");
		for (const name of [
			"dev",
			"dev:all",
			"build",
			"test",
			"typecheck",
			"lint",
			"lint:fix",
			"check",
			"perf",
			"db:generate",
			"e2e",
			"release",
		]) {
			expect(scripts).toHaveProperty(name);
		}
		expect(scripts.check).toBe("bun scripts/check.ts");
		expect(checkTasks.full).toContain("lint");
		expect(checkTasks.full).toContain("typecheck");
		expect(checkTasks.full).toContain("test");
	});

	// plan.md: `check` runs lint, typecheck, test, the size budget, and the 10k
	// perf suite. The two tasks belong to apps/web and apps/server. turbo refuses
	// a task that turbo.json does not declare, so the root declares both.
	test("check runs the size budget and the 10k perf suite through turbo", async () => {
		const { tasks } = await json("turbo.json");
		for (const name of ["size-budget", "perf:10k"]) {
			expect(checkTasks.full).toContain(name);
			expect(tasks).toHaveProperty(name);
		}
		expect(tasks["size-budget"].dependsOn).toContain("build");
		expect(tasks["perf:10k"].cache).toBe(false);
	});

	test("turbo.json declares dev as persistent and build with dist outputs", async () => {
		const { tasks } = await json("turbo.json");
		expect(tasks.dev.persistent).toBe(true);
		expect(tasks.dev.cache).toBe(false);
		expect(tasks.build.dependsOn).toContain("^build");
		expect(tasks.build.outputs).toContain("dist/**");
		for (const name of ["test", "typecheck", "lint", "db:generate", "perf"]) {
			expect(tasks).toHaveProperty(name);
		}
	});

	test("biome.json restricts db/client, motion, radix, and shadcn imports with the plan messages", async () => {
		const messages = restrictedImportMessages(await json("biome.json"));
		expect(messages.get("**/db/client")).toContain("every query takes tx first");
		expect(messages.get("**/db/client")).toContain("deadlocks the server");
		expect(messages.get("motion")).toContain("motion/mini and CSS transitions only");
		expect(messages.get("framer-motion")).toContain("motion/mini and CSS transitions only");
		for (const specifier of ["@radix-ui/*", "radix-ui", "radix-ui/**"]) {
			expect(messages.get(specifier)).toBeString();
			expect(messages.get(specifier)).not.toBeEmpty();
		}
		expect(messages.get("shadcn")).toBeString();
		expect(messages.get("shadcn")).not.toBeEmpty();
	});

	test("biome.json formats with tabs, enables recommended rules, and organizes imports", async () => {
		const biome = await json("biome.json");
		expect(biome.formatter.indentStyle).toBe("tab");
		expect(biome.linter.rules.recommended).toBe(true);
		expect(biome.assist.actions.source.organizeImports).toBe("on");
	});

	test("tsconfig.base.json enables strict, verbatimModuleSyntax, and noUncheckedIndexedAccess", async () => {
		const { compilerOptions } = await json("tsconfig.base.json");
		expect(compilerOptions.strict).toBe(true);
		expect(compilerOptions.verbatimModuleSyntax).toBe(true);
		expect(compilerOptions.noUncheckedIndexedAccess).toBe(true);
		expect(compilerOptions.module).toBe("preserve");
		expect(compilerOptions.moduleResolution).toBe("bundler");
		expect(compilerOptions.jsx).toBe("react-jsx");
		expect(compilerOptions.types).toContain("bun");
	});

	test("bunfig.toml preloads test/preload.ts which sets TRELLIS_HOME to a temp dir", () => {
		expect(bunfig.test.preload).toContain("./test/preload.ts");
		const home = process.env.TRELLIS_HOME!;
		expect(existsSync(home)).toBe(true);
		expect(home.startsWith(homedir())).toBe(false);
	});

	test("LICENSE is MIT for Navid Khan 2026", async () => {
		const license = await text("LICENSE");
		expect(license).toStartWith("MIT License");
		expect(license).toContain("2026 Navid Khan");
	});

	test("the root docs, changelog, changeset config, and editorconfig exist", async () => {
		const files = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", ".changeset/config.json", ".editorconfig"];
		expect(files.filter((file) => !existsSync(join(root, file)))).toEqual([]);
		expect(await text("README.md")).toContain("docs/design/plan.md");
		const { fixed } = await json(".changeset/config.json");
		expect(fixed[0].some((entry: string) => entry.startsWith("@trellis/"))).toBe(true);
	});

	// Every workspace is private. @changesets/cli defaults a private package to
	// `version: false`, and then `bun run release` bumps nothing.
	test(".changeset/config.json versions and tags private packages", async () => {
		const { privatePackages } = await json(".changeset/config.json");
		expect(privatePackages).toEqual({ version: true, tag: true });
	});

	test("AGENTS.md states the tx-first, STE, no-fallback, TDD, and design checklist rules under 120 lines", async () => {
		const agents = await text("AGENTS.md");
		expect(agents).toMatch(/`?tx`? first/);
		expect(agents).toContain("STE");
		expect(agents).toContain("no fallbacks");
		expect(agents).toMatch(/failing test/i);
		expect(agents).toMatch(/without a test does not merge/i);
		expect(agents).toContain("design checklist");
		expect(agents).toContain("bun run check");
		expect(agents.split("\n").length).toBeLessThan(120);
	});

	test("ci.yml runs bun run check on macOS and Ubuntu", async () => {
		const ci = Bun.YAML.parse(await text(".github/workflows/ci.yml")) as {
			jobs: {
				check: {
					strategy: { matrix: { os: string[] } };
					steps: Array<{ uses?: string; run?: string }>;
				};
			};
		};
		const { check } = ci.jobs;
		expect(check.strategy.matrix.os).toContain("macos-latest");
		expect(check.strategy.matrix.os).toContain("ubuntu-latest");
		expect(check.steps.some((step) => step.uses?.startsWith("oven-sh/setup-bun"))).toBe(true);
		expect(check.steps.some((step) => step.run?.includes("bun run check"))).toBe(true);
	});

	test("issue templates exist and the PR template has no headers", async () => {
		const files = [
			".github/ISSUE_TEMPLATE/bug.yml",
			".github/ISSUE_TEMPLATE/feature.yml",
			".github/PULL_REQUEST_TEMPLATE.md",
		];
		expect(files.filter((file) => !existsSync(join(root, file)))).toEqual([]);
		expect(await text(".github/PULL_REQUEST_TEMPLATE.md")).not.toMatch(/^#{1,6} /m);
	});

	// Bun reads bunfig.toml from the current directory only. turbo runs `bun test`
	// inside each workspace, so a workspace without its own preload starts with
	// TRELLIS_HOME unset and its tests write to ~/.trellis.
	test("every workspace bunfig.toml preloads the root test/preload.ts", async () => {
		const workspaces = ["apps", "packages"].flatMap((dir) =>
			readdirSync(join(root, dir))
				.map((entry) => join(dir, entry))
				.filter((workspace) => existsSync(join(root, workspace, "package.json"))),
		);
		for (const workspace of workspaces) {
			const config = Bun.TOML.parse(await text(join(workspace, "bunfig.toml"))) as { test: { preload: string[] } };
			expect(config.test.preload).toContain("../../test/preload.ts");
		}
	});

	test("AGENTS.md and CONTRIBUTING.md state the workspace bunfig rule and the tx-first service signature", async () => {
		const agents = await text("AGENTS.md");
		const contributing = await text("CONTRIBUTING.md");
		expect(agents).toContain('preload = ["../../test/preload.ts"]');
		expect(contributing).toContain('preload = ["../../test/preload.ts"]');
		expect(contributing).toContain("(tx, ctx, input) => result");
		expect(contributing).not.toContain("(ctx, tx, input)");
	});

	// The root package.json lists `apps/*` and `packages/*` as workspaces, so an
	// entry without a package.json is a directory bun cannot install.
	test("apps and packages hold a .gitkeep and workspaces only", () => {
		for (const dir of ["apps", "packages"]) {
			const entries = readdirSync(join(root, dir));
			expect(entries).toContain(".gitkeep");
			const workspaces = entries.filter((entry) => !entry.startsWith("."));
			for (const workspace of workspaces) {
				expect(existsSync(join(root, dir, workspace, "package.json"))).toBe(true);
			}
		}
	});

	// The nested run runs lint and typecheck only, so every task with
	// `cache: false` and the 10k perf suite run once per `bun run check`. The
	// nested run skips this test, so a check that runs test:repo in nested mode
	// cannot recurse without end.
	test.skipIf(process.env.TRELLIS_CHECK_NESTED === "1")(
		"bun run check exits 0, and the nested run covers lint and typecheck only",
		() => {
			const result = Bun.spawnSync(["bun", "run", "check", "--summarize"], {
				cwd: root,
				env: { ...process.env, TRELLIS_CHECK_NESTED: "1" },
				stdout: "pipe",
				stderr: "pipe",
			});
			const output = result.stdout.toString() + result.stderr.toString();
			if (result.exitCode !== 0) console.log(output);
			expect(result.exitCode).toBe(0);
			const summaryPath = /^Summary:\s+(.+\.json)$/m.exec(output)![1]!;
			const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as { tasks: Array<{ task: string }> };
			const ran = summary.tasks.map((entry) => entry.task);
			expect(ran).toContain("lint");
			expect(ran).toContain("typecheck:repo");
			for (const task of ["test", "size-budget", "perf:10k", "test:repo"]) {
				expect(ran).not.toContain(task);
			}
		},
		600_000,
	);
});
