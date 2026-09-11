import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import bunfig from "../bunfig.toml";
import { checkTasks } from "../scripts/check";

// Each test reads one root file and checks the fields the repo needs in it.
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

	test("package.json declares every root script", async () => {
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

	test("check runs the size budget and performance tasks remain available", async () => {
		const { tasks } = await json("turbo.json");
		expect(checkTasks.full).toContain("size-budget");
		expect(checkTasks.full).not.toContain("perf:10k");
		for (const name of ["size-budget", "perf:10k"]) expect(tasks).toHaveProperty(name);
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

	test("biome.json restricts db/client, motion, radix, and shadcn imports with the rule messages", async () => {
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

	// Biome 2.5 marks `rules.recommended` deprecated in favor of `rules.preset`.
	// A deprecated field prints an info line on every lint run.
	test("biome.json formats with tabs, uses the recommended preset, and organizes imports", async () => {
		const biome = await json("biome.json");
		expect(biome.formatter.indentStyle).toBe("tab");
		expect(biome.linter.rules.preset).toBe("recommended");
		expect(biome.linter.rules).not.toHaveProperty("recommended");
		expect(biome.assist.actions.source.organizeImports).toBe("on");
	});

	test("bun run lint prints no DEPRECATED diagnostic", () => {
		const result = Bun.spawnSync(["bun", "run", "lint"], { cwd: root, stdout: "pipe", stderr: "pipe" });
		const output = result.stdout.toString() + result.stderr.toString();
		expect(output).not.toContain("DEPRECATED");
		expect(result.exitCode).toBe(0);
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

	// Design reviewers write screenshots to .review/ in every worktree.
	test(".gitignore ignores the .review/ screenshot directory", async () => {
		const lines = (await text(".gitignore")).split("\n");
		expect(lines).toContain(".review/");
	});

	test("LICENSE is MIT for Navid Khan 2026", async () => {
		const license = await text("LICENSE");
		expect(license).toStartWith("MIT License");
		expect(license).toContain("2026 Navid Khan");
	});

	test("the root docs, changelog, changeset config, and editorconfig exist", async () => {
		const files = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", ".changeset/config.json", ".editorconfig"];
		expect(files.filter((file) => !existsSync(join(root, file)))).toEqual([]);
		expect(await text("README.md")).toContain("docs/ARCHITECTURE.md");
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
		expect(agents).toContain("Assess the risk of each change");
		expect(agents).toContain("Treat the full `bun run check` command as optional");
		expect(agents).not.toContain("Run `bun run check` once");
		expect(agents.split("\n").length).toBeLessThan(120);
	});

	// The repository is public, so the contributor documents address a
	// contributor and not one team. A named lead, a reviewer panel, and the
	// session trailer of one agent runner have no meaning outside that team.
	test("AGENTS.md and CONTRIBUTING.md name no lead, no reviewer panel, and no session trailer", async () => {
		for (const path of ["AGENTS.md", "CONTRIBUTING.md"]) {
			const document = await text(path);
			expect(document, path).not.toMatch(/\blead\b/i);
			expect(document, path).not.toMatch(/two reviewers/i);
			expect(document, path).not.toMatch(/reviewer panel/i);
			expect(document, path).not.toContain("Claude-Session");
		}
	});

	// A contributor arrives from GitHub, so the entry documents point at the
	// conduct rules, the security model, and the architecture reference.
	test("CONTRIBUTING.md points at the code of conduct, the security model, and the architecture", async () => {
		const contributing = await text("CONTRIBUTING.md");
		for (const target of ["CODE_OF_CONDUCT.md", "SECURITY.md", "docs/ARCHITECTURE.md"]) {
			expect(contributing, target).toContain(target);
			expect(existsSync(join(root, target)), target).toBe(true);
		}
	});

	// A vulnerability goes to a private advisory, so the public issue form
	// never becomes the first report of one.
	test("SECURITY.md and the issue template config route a vulnerability to a private advisory", async () => {
		const advisory = "security/advisories/new";
		expect(await text("SECURITY.md")).toContain(advisory);
		const config = Bun.YAML.parse(await text(".github/ISSUE_TEMPLATE/config.yml")) as {
			blank_issues_enabled: boolean;
			contact_links: Array<{ name: string; url: string; about: string }>;
		};
		expect(config.blank_issues_enabled).toBe(false);
		expect(config.contact_links.some((link) => link.url.includes(advisory))).toBe(true);
	});

	// An issue is public and a ticket title is not, so the bug form warns
	// before it asks for the status output and the log lines.
	test("the bug template tells a reporter to redact titles and paths", async () => {
		const bug = await text(".github/ISSUE_TEMPLATE/bug.yml");
		expect(bug.toLowerCase()).toContain("redact");
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

	// ARCHITECTURE.md, Database schema: CI fails on a non-empty
	// `git status --porcelain drizzle/` after `drizzle-kit generate`.
	test("ci.yml regenerates the migrations and fails on a drizzle diff", async () => {
		const ci = Bun.YAML.parse(await text(".github/workflows/ci.yml")) as {
			jobs: Record<string, { steps: Array<{ run?: string }> }>;
		};
		const runs = ci.jobs["drizzle-diff"]!.steps.map((step) => step.run ?? "");
		expect(runs).toContain("bun run db:generate");
		expect(runs.some((run) => run.includes("git status --porcelain apps/server/drizzle/"))).toBe(true);
	});

	// ARCHITECTURE.md, Performance budgets: the 10k seed runs in `bun run perf:10k`
	// and the 50k seed in `bun run perf`. turbo runs a task only in a
	// workspace whose package.json defines the script, and reports success
	// when none does.
	test("apps/server defines the perf:10k and perf scripts over test/perf", async () => {
		const { scripts } = await json("apps/server/package.json");
		expect(scripts["perf:10k"]).toContain("TRELLIS_PERF_ROWS=10000");
		expect(scripts["perf:10k"]).toContain("test/perf/");
		expect(scripts.perf).toContain("TRELLIS_PERF_ROWS=50000");
		expect(existsSync(join(root, "apps/server/test/perf/seed.ts"))).toBe(true);
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

	// apps/server is the first app. turbo runs `bun test` inside it, so its
	// bunfig.toml must carry the shared preload like every other workspace.
	test("every workspace ships a bunfig.toml with the shared preload", async () => {
		const server = await json("apps/server/package.json");
		expect(server.name).toBe("@trellis/server");
		expect(server.scripts.test).toBe("bun test");
		const workspaces = ["apps", "packages"].flatMap((dir) =>
			readdirSync(join(root, dir))
				.map((entry) => join(dir, entry))
				.filter((workspace) => existsSync(join(root, workspace, "package.json"))),
		);
		expect(workspaces).toContain("apps/server");
		for (const workspace of workspaces) {
			expect(existsSync(join(root, workspace, "bunfig.toml")), workspace).toBe(true);
			const config = Bun.TOML.parse(await text(join(workspace, "bunfig.toml"))) as { test: { preload: string[] } };
			expect(config.test.preload).toContain("../../test/preload.ts");
		}
	});

	// ARCHITECTURE.md, Code organization: a service is `(ctx, tx, input) => result`.
	test("AGENTS.md and CONTRIBUTING.md state the workspace bunfig rule and the service signature", async () => {
		const agents = await text("AGENTS.md");
		const contributing = await text("CONTRIBUTING.md");
		expect(agents).toContain('preload = ["../../test/preload.ts"]');
		expect(contributing).toContain('preload = ["../../test/preload.ts"]');
		expect(contributing).toContain("(ctx, tx, input) => result");
		expect(contributing).not.toContain("(tx, ctx, input)");
	});

	// The root package.json lists `apps/*` and `packages/*` as workspaces, so an
	// entry without a package.json is a directory bun cannot install.
	test("apps and packages hold workspaces only", () => {
		for (const dir of ["apps", "packages"]) {
			const workspaces = readdirSync(join(root, dir)).filter((entry) => !entry.startsWith("."));
			expect(workspaces.length, dir).toBeGreaterThan(0);
			for (const workspace of workspaces) {
				expect(existsSync(join(root, dir, workspace, "package.json"))).toBe(true);
			}
		}
	});

	// A generated iOS or Android project, a local .env file, and a build cache
	// never enter the history of a public repository.
	test(".gitignore covers the generated mobile projects, env files, and build caches", async () => {
		const lines = (await text(".gitignore")).split("\n");
		for (const entry of ["apps/mobile/ios/", "apps/mobile/android/", ".env*", "*.tsbuildinfo", "playwright-report/"]) {
			expect(lines, entry).toContain(entry);
		}
	});

	// The nested check covers lint and types. It excludes test:repo because
	// test:repo would call this test again without end.
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
