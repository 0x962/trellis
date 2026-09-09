import { describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The probe project lives under TRELLIS_HOME, outside this repo, so Biome
// reads only the fixture files. The root biome.json is copied into the probe
// root: Biome resolves the globs of an override against the directory that
// holds the config file, so a config outside the probe matches no
// `packages/*` or `apps/*` override.
const root = join(import.meta.dir, "..");
const probe = join(process.env.TRELLIS_HOME as string, "biome-probe");

type Diagnostic = { category: string; location: { path: string } };

// Returns the set of "<file>:<rule>" pairs Biome reports for the probe project.
// The probe is not a git repository, so the vcs integration is switched off.
const lint = () => {
	copyFileSync(join(root, "biome.json"), join(probe, "biome.json"));
	const result = Bun.spawnSync(
		[join(root, "node_modules/.bin/biome"), "lint", "--vcs-enabled=false", "--reporter=json", "."],
		{ cwd: probe, stdout: "pipe", stderr: "pipe" },
	);
	const { diagnostics } = JSON.parse(result.stdout.toString()) as { diagnostics: Diagnostic[] };
	return new Set(diagnostics.map((d) => `${d.location.path}:${d.category}`));
};

const write = (relativePath: string, source: string) => {
	mkdirSync(join(probe, relativePath, ".."), { recursive: true });
	writeFileSync(join(probe, relativePath), source);
};

const rule = "lint/style/noRestrictedImports";

describe("biome import rules", () => {
	test("db/ files import the client; every other file, motion, radix, and shadcn are refused", () => {
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
		write("src/ui/shadcn.ts", 'import { cn } from "shadcn";\nexport const c = cn;\n');

		const findings = lint();
		expect(findings).not.toContain(`src/db/tx.ts:${rule}`);
		expect(findings).not.toContain(`src/db/boot.ts:${rule}`);
		expect(findings).not.toContain(`src/db/queries/list.ts:${rule}`);
		expect(findings).not.toContain(`src/ui/mini.ts:${rule}`);
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
			"src/ui/shadcn.ts",
		]) {
			expect(findings).toContain(`${file}:${rule}`);
		}
	});

	test("layers import downward only: api is imported by server, web, mobile, and cli; ui by web only", () => {
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

		const findings = lint();
		for (const file of [
			"packages/cli/src/api.ts",
			"apps/server/src/api.ts",
			"apps/server/src/db/tx.ts",
			"apps/web/src/api.ts",
			"apps/web/src/ui.ts",
			"apps/mobile/src/api.ts",
		]) {
			expect(findings).not.toContain(`${file}:${rule}`);
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
			expect(findings).toContain(`${file}:${rule}`);
		}
	});
});
