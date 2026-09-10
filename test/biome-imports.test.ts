import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A probe project lives under TRELLIS_HOME, outside this repo, so Biome reads
// only the fixture files. The root biome.json is copied into the probe root:
// Biome resolves the globs of an override against the directory that holds
// the config file, so a config outside the probe matches no `packages/*` or
// `apps/*` override. Each test gets its own probe, so the files of one test
// never appear in the findings of another.
const root = join(import.meta.dir, "..");

type Diagnostic = { category: string; severity: string; location: { path: string } };

const rule = "lint/style/noRestrictedImports";

const createProbe = (name: string) => {
	const dir = join(process.env.TRELLIS_HOME as string, `biome-probe-${name}`);
	mkdirSync(dir, { recursive: true });
	copyFileSync(join(root, "biome.json"), join(dir, "biome.json"));

	const write = (relativePath: string, source: string) => {
		mkdirSync(join(dir, relativePath, ".."), { recursive: true });
		writeFileSync(join(dir, relativePath), source);
	};

	// Runs `biome lint` over the probe. `errors` holds "<file>:<rule>" for every
	// diagnostic at severity error. A warning is not in the set: Biome exits 0 on
	// a warning, so a rule at warn level never fails `bun run lint`. The probe is
	// not a git repository, so the vcs integration is switched off.
	const lint = () => {
		const result = Bun.spawnSync(
			[join(root, "node_modules/.bin/biome"), "lint", "--vcs-enabled=false", "--reporter=json", "."],
			{ cwd: dir, stdout: "pipe", stderr: "pipe" },
		);
		const { diagnostics } = JSON.parse(result.stdout.toString()) as { diagnostics: Diagnostic[] };
		const errors = new Set(
			diagnostics.filter((d) => d.severity === "error").map((d) => `${d.location.path}:${d.category}`),
		);
		return { exitCode: result.exitCode, errors };
	};

	return { dir, write, lint };
};

// One import per root restriction, keyed by the fixture name.
const refused: Record<string, string> = {
	motion: 'import { animate } from "motion";\nexport const a = animate;\n',
	motionReact: 'import { motion } from "motion/react";\nexport const m = motion;\n',
	framer: 'import { motion } from "framer-motion";\nexport const m = motion;\n',
	radix: 'import { Dialog } from "@radix-ui/react-dialog";\nexport const d = Dialog;\n',
	radixUnified: 'import { Dialog } from "radix-ui";\nexport const d = Dialog;\n',
	radixUnifiedPath: 'import { Dialog } from "radix-ui/internal";\nexport const d = Dialog;\n',
	shadcn: 'import { cn } from "shadcn";\nexport const c = cn;\n',
	client: 'import { db } from "../db/client";\nexport const t = db;\n',
};

// Every directory that biome.json gives its own noRestrictedImports override.
// Biome replaces the options of a rule inside an override and does not merge
// them with the root rule, so an override that omits one root pattern opens
// that import for its whole directory.
const overrideDirs = [
	"packages/api",
	"packages/ui",
	"packages/cli",
	"apps/server",
	"apps/server/src/db",
	"apps/server/test/helpers",
	"apps/web",
	"apps/mobile",
];

// The directories whose files may import db/client.
const clientImporters = ["apps/server/src/db", "apps/server/test/helpers"];

describe("biome import rules", () => {
	test("a probe with only allowed imports passes lint with exit 0", () => {
		const { write, lint } = createProbe("clean");
		write("src/db/client.ts", "export const db = 1;\n");
		write("src/db/tx.ts", 'import { db } from "./client";\nexport const tx = db;\n');
		write("src/ui/mini.ts", 'import { animate } from "motion/mini";\nexport const a = animate;\n');

		const { exitCode, errors } = lint();
		expect(errors).toBeEmpty();
		expect(exitCode).toBe(0);
	});

	test("db/ files import the client; every other file, motion, radix, and shadcn are refused", () => {
		const { write, lint } = createProbe("rules");
		write("src/db/client.ts", "export const db = 1;\n");
		write("src/db/tx.ts", 'import { db } from "./client";\nexport const tx = db;\n');
		write("src/db/boot.ts", 'import { db } from "./client.ts";\nexport const boot = db;\n');
		write("src/db/queries/list.ts", 'import { db } from "../client";\nexport const list = db;\n');
		write("src/services/tickets.ts", 'import { db } from "../db/client";\nexport const tickets = db;\n');
		write("src/services/ext.ts", 'import { db } from "../db/client.ts";\nexport const ext = db;\n');
		write("src/services/js.ts", 'import { db } from "../db/client.js";\nexport const js = db;\n');
		write("src/services/index.ts", 'import { db } from "../db/client/index";\nexport const index = db;\n');
		write("src/deep/service.ts", 'import { db } from "@trellis/server/src/db/client";\nexport const s = db;\n');
		write("src/ui/motion.ts", 'import { animate } from "motion";\nexport const a = animate;\n');
		write("src/ui/react.ts", 'import { motion } from "motion/react";\nexport const m = motion;\n');
		write("src/ui/reactm.ts", 'import * as m from "motion/react-m";\nexport const r = m;\n');
		write("src/ui/dom.ts", 'import { animate } from "motion/dom";\nexport const a = animate;\n');
		write("src/ui/framer.ts", 'import { motion } from "framer-motion";\nexport const m = motion;\n');
		write("src/ui/framerDom.ts", 'import { animate } from "framer-motion/dom";\nexport const a = animate;\n');
		write("src/ui/framerClient.ts", 'import { motion } from "framer-motion/client";\nexport const m = motion;\n');
		write("src/ui/mini.ts", 'import { animate } from "motion/mini";\nexport const a = animate;\n');
		write("src/ui/radix.ts", 'import { Dialog } from "@radix-ui/react-dialog";\nexport const d = Dialog;\n');
		write("src/ui/radixUnified.ts", 'import { Dialog } from "radix-ui";\nexport const d = Dialog;\n');
		write("src/ui/radixUnifiedPath.ts", 'import { Dialog } from "radix-ui/internal";\nexport const d = Dialog;\n');
		write("src/ui/shadcn.ts", 'import { cn } from "shadcn";\nexport const c = cn;\n');

		const { exitCode, errors } = lint();
		expect(exitCode).not.toBe(0);
		expect(errors).not.toContain(`src/db/tx.ts:${rule}`);
		expect(errors).not.toContain(`src/db/boot.ts:${rule}`);
		expect(errors).not.toContain(`src/db/queries/list.ts:${rule}`);
		expect(errors).not.toContain(`src/ui/mini.ts:${rule}`);
		for (const file of [
			"src/services/tickets.ts",
			"src/services/ext.ts",
			"src/services/js.ts",
			"src/services/index.ts",
			"src/deep/service.ts",
			"src/ui/motion.ts",
			"src/ui/react.ts",
			"src/ui/reactm.ts",
			"src/ui/dom.ts",
			"src/ui/framer.ts",
			"src/ui/framerDom.ts",
			"src/ui/framerClient.ts",
			"src/ui/radix.ts",
			"src/ui/radixUnified.ts",
			"src/ui/radixUnifiedPath.ts",
			"src/ui/shadcn.ts",
		]) {
			expect(errors).toContain(`${file}:${rule}`);
		}
	});

	test("layers import downward only: api is imported by server, web, mobile, and cli; ui by web only", () => {
		const { write, lint } = createProbe("layers");
		const imports = (name: string) => `import { x } from "@trellis/${name}";\nexport const y = x;\n`;
		write("packages/api/src/server.ts", imports("server"));
		write("packages/api/src/ui.ts", imports("ui/tokens"));
		write("packages/ui/src/api.ts", imports("api"));
		write("packages/cli/src/api.ts", imports("api"));
		write("packages/cli/src/ui.ts", imports("ui"));
		write("packages/cli/src/server.ts", imports("server"));
		write("apps/server/src/api.ts", imports("api"));
		write("apps/server/src/ui.ts", imports("ui"));
		write("apps/server/src/db/client.ts", "export const db = 1;\n");
		write("apps/server/src/db/tx.ts", 'import { db } from "./client";\nexport const tx = db;\n');
		write("apps/server/src/db/ui.ts", imports("ui"));
		write("apps/server/src/db/motion.ts", 'import { motion } from "motion/react";\nexport const m = motion;\n');
		write("apps/server/src/services/tickets.ts", 'import { db } from "../db/client.ts";\nexport const t = db;\n');
		write("apps/web/src/api.ts", imports("api"));
		write("apps/web/src/ui.ts", imports("ui"));
		write("apps/web/src/server.ts", imports("server"));
		write("apps/mobile/src/api.ts", imports("api"));
		write("apps/mobile/src/ui.ts", imports("ui"));

		const { exitCode, errors } = lint();
		expect(exitCode).not.toBe(0);
		for (const file of [
			"packages/cli/src/api.ts",
			"apps/server/src/api.ts",
			"apps/server/src/db/tx.ts",
			"apps/web/src/api.ts",
			"apps/web/src/ui.ts",
			"apps/mobile/src/api.ts",
		]) {
			expect(errors).not.toContain(`${file}:${rule}`);
		}
		for (const file of [
			"packages/api/src/server.ts",
			"packages/api/src/ui.ts",
			"packages/ui/src/api.ts",
			"packages/cli/src/ui.ts",
			"packages/cli/src/server.ts",
			"apps/server/src/ui.ts",
			"apps/server/src/db/ui.ts",
			"apps/server/src/db/motion.ts",
			"apps/server/src/services/tickets.ts",
			"apps/web/src/server.ts",
			"apps/mobile/src/ui.ts",
		]) {
			expect(errors).toContain(`${file}:${rule}`);
		}
	});

	test("every override directory refuses every root restriction", () => {
		const { write, lint } = createProbe("overrides");
		for (const dir of overrideDirs) {
			for (const [name, source] of Object.entries(refused)) {
				write(`${dir}/${name}.ts`, source);
			}
			write(`${dir}/mini.ts`, 'import { animate } from "motion/mini";\nexport const a = animate;\n');
		}

		const { exitCode, errors } = lint();
		expect(exitCode).not.toBe(0);
		for (const dir of overrideDirs) {
			for (const name of Object.keys(refused)) {
				// apps/server/src/db holds the client, so a file there imports it. The
				// test helpers open the database every test file runs against.
				const allowed = clientImporters.includes(dir) && name === "client";
				if (allowed) {
					expect(errors).not.toContain(`${dir}/${name}.ts:${rule}`);
				} else {
					expect(errors).toContain(`${dir}/${name}.ts:${rule}`);
				}
			}
			expect(errors).not.toContain(`${dir}/mini.ts:${rule}`);
		}
	});

	// The probe root mirrors the repo's own layout under the copied biome.json,
	// so the `apps/server/**` and `apps/server/src/db/**` overrides apply to the
	// same relative paths they match in the repo. `biome check` is the command
	// `bun run lint` runs. Nothing is written inside the repo: `bun run check`
	// runs lint and this test at the same time over the same tree.
	test("biome refuses an import of db/client from outside db/", () => {
		const { write, dir } = createProbe("committed");
		write("apps/server/src/db/client.ts", "export const openDb = 1;\n");
		write(
			"apps/server/src/services/probe.ts",
			'import { openDb } from "../db/client.ts";\n\nexport const probe = openDb;\n',
		);
		write("apps/server/src/db/probe.ts", 'import { openDb } from "./client.ts";\n\nexport const probe = openDb;\n');
		const check = (file: string) => {
			const result = Bun.spawnSync([join(root, "node_modules/.bin/biome"), "check", "--vcs-enabled=false", file], {
				cwd: dir,
				stdout: "pipe",
				stderr: "pipe",
			});
			return { exitCode: result.exitCode, output: result.stdout.toString() + result.stderr.toString() };
		};
		const bad = check("apps/server/src/services/probe.ts");
		expect(bad.exitCode).not.toBe(0);
		expect(bad.output).toContain("noRestrictedImports");
		expect(bad.output).toContain("deadlocks the server");
		const good = check("apps/server/src/db/probe.ts");
		expect(good.output).not.toContain("noRestrictedImports");
		expect(good.exitCode).toBe(0);
		expect(existsSync(join(root, "apps/server/src/services/probe.ts"))).toBe(false);
		expect(existsSync(join(root, "apps/server/src/db/probe.ts"))).toBe(false);
	});
});
