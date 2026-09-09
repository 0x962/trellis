import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// The probe project lives under TRELLIS_HOME, outside this repo, so Biome
// reads only the fixture files and the root biome.json.
const root = join(import.meta.dir, "..");
const probe = join(process.env.TRELLIS_HOME as string, "biome-probe");

type Diagnostic = { category: string; location: { path: string } };

// Returns the set of "<file>:<rule>" pairs Biome reports for the probe project.
const lint = () => {
	const result = Bun.spawnSync(
		[join(root, "node_modules/.bin/biome"), "lint", "--config-path", join(root, "biome.json"), "--reporter=json", "."],
		{ cwd: probe, stdout: "pipe", stderr: "pipe" },
	);
	const { diagnostics } = JSON.parse(result.stdout.toString()) as { diagnostics: Diagnostic[] };
	return new Set(diagnostics.map((d) => `${d.location.path}:${d.category}`));
};

const write = (relativePath: string, source: string) => {
	mkdirSync(join(probe, relativePath, ".."), { recursive: true });
	writeFileSync(join(probe, relativePath), source);
};

describe("biome import rules", () => {
	test("db/ files import the client; every other file, motion, radix, and shadcn are refused", () => {
		write("src/db/client.ts", "export const db = 1;\n");
		write("src/db/tx.ts", 'import { db } from "./client";\nexport const tx = db;\n');
		write("src/db/queries/list.ts", 'import { db } from "../client";\nexport const list = db;\n');
		write("src/services/tickets.ts", 'import { db } from "../db/client";\nexport const tickets = db;\n');
		write("src/deep/service.ts", 'import { db } from "@trellis/server/src/db/client";\nexport const s = db;\n');
		write("src/ui/motion.ts", 'import { animate } from "motion";\nexport const a = animate;\n');
		write("src/ui/framer.ts", 'import { motion } from "framer-motion";\nexport const m = motion;\n');
		write("src/ui/mini.ts", 'import { animate } from "motion/mini";\nexport const a = animate;\n');
		write("src/ui/radix.ts", 'import { Dialog } from "@radix-ui/react-dialog";\nexport const d = Dialog;\n');
		write("src/ui/shadcn.ts", 'import { cn } from "shadcn";\nexport const c = cn;\n');

		const findings = lint();
		const rule = "lint/style/noRestrictedImports";
		expect(findings).not.toContain(`src/db/tx.ts:${rule}`);
		expect(findings).not.toContain(`src/db/queries/list.ts:${rule}`);
		expect(findings).not.toContain(`src/ui/mini.ts:${rule}`);
		for (const file of [
			"src/services/tickets.ts",
			"src/deep/service.ts",
			"src/ui/motion.ts",
			"src/ui/framer.ts",
			"src/ui/radix.ts",
			"src/ui/shadcn.ts",
		]) {
			expect(findings).toContain(`${file}:${rule}`);
		}
	});
});
