import { originDir } from "../../../../../test/originDir.ts";
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(originDir(import.meta.dir), "..");

// The verbs whose module exports a named command beside the default.
const verbs = ["show", "comments", "attachments", "statuses", "instructions"];

// CLI-05: `trellis install` runs a built bundle, so every verb module must
// resolve from the bundle. A computed import specifier survives the build
// as a runtime lookup that fails there.
test("every verb loads from a bun build of the entrypoint", async () => {
	const outdir = mkdtempSync(join(tmpdir(), "trellis-cli-bundle-"));
	const build = await Bun.build({
		entrypoints: [join(root, "src/index.ts")],
		outdir,
		target: "bun",
		splitting: true,
	});
	expect(build.logs.map((log) => log.message)).toEqual([]);
	expect(build.success).toBe(true);
	for (const verb of verbs) {
		const result = Bun.spawnSync(["bun", join(outdir, "index.js"), verb, "--help"], {
			cwd: outdir,
			env: { ...process.env, TRELLIS_ACTOR: "agent:test" },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.stderr.toString(), verb).toBe("");
		expect(result.exitCode, verb).toBe(0);
		expect(result.stdout.toString(), verb).toContain(verb);
	}
});
