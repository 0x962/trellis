import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { interactiveLaunchSpec } from "../../../../../src/agents/native/interactiveLaunchSpec.ts";

test("agent commands keep the host CLI before an obsolete wrapper from shell startup", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-cli-path-"));
	const bundled = join(home, "bundled");
	const stale = join(home, "stale");
	try {
		await Promise.all([mkdir(bundled), mkdir(stale)]);
		await writeFile(join(bundled, "trellis"), '#!/bin/sh\nprintf "current:%s" "$TRELLIS_AUTH_TOKEN"\n', {
			mode: 0o700,
		});
		await writeFile(join(stale, "trellis"), '#!/bin/sh\nprintf "obsolete"\n', { mode: 0o700 });
		await writeFile(join(home, ".zprofile"), `export PATH='${stale}:/usr/bin:/bin'\n`);
		await writeFile(join(home, ".zshenv"), `export PATH='${stale}:/usr/bin:/bin'\n`);
		const spec = interactiveLaunchSpec({
			id: "path-check",
			command: "exec trellis",
			cwd: home,
			preset: "custom",
			hookCommand: "unused",
			env: { HOME: home, ZDOTDIR: home, PATH: `${bundled}:/usr/bin:/bin`, TRELLIS_AUTH_TOKEN: "test-token" },
		});
		const child = Bun.spawn([spec.command, ...spec.args], {
			cwd: spec.cwd,
			env: spec.env,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stdout).text()).toBe("current:test-token");
	} finally {
		await rm(home, { recursive: true, force: true });
	}
});
