import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCli } from "../../../../src/installCli/installCli.ts";

const homes: string[] = [];
afterEach(async () => {
	for (const home of homes.splice(0)) await rm(home, { recursive: true });
});
test("installed CLI selects the desktop release and home and preserves arguments", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis cli's "));
	homes.push(root);
	const release = join(root, "release");
	const bin = join(root, "bin");
	const home = join(root, "data");
	await mkdir(join(release, "bin"), { recursive: true });
	await writeFile(join(release, "bin/bun"), '#!/bin/sh\nprintf "%s\\n" "$TRELLIS_DESKTOP_HOME" "$TRELLIS_URL" "$@"\n', {
		mode: 0o755,
	});
	await installCli({ bin, root: release, home });
	const run = Bun.spawn([join(bin, "trellis"), "show", "ticket with spaces"], {
		env: { PATH: "/usr/bin:/bin" },
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(await new Response(run.stdout).text()).toBe(
		`${home}\n\n${release}/packages/cli/src/index.ts\nshow\nticket with spaces\n`,
	);
	expect(await run.exited).toBe(0);
	const custom = Bun.spawn([join(bin, "trellis"), "status"], {
		env: { PATH: "/usr/bin:/bin", TRELLIS_URL: "https://example.com" },
		stdout: "pipe",
	});
	expect(await new Response(custom.stdout).text()).toContain("https://example.com\n");
	expect(await custom.exited).toBe(0);
	expect(await readFile(join(bin, "trellis"), "utf8")).not.toContain("secret");
});
