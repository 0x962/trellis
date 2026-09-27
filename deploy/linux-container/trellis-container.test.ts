import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("refuses a second container name for one data home", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-linux-container-manager-"));
	try {
		const writerGuard = join(root, "container", "writer.lock");
		await mkdir(writerGuard, { recursive: true });
		await writeFile(join(writerGuard, "container-name"), "first-host\n");
		const child = Bun.spawn({
			cmd: [join(import.meta.dir, "trellis-container.sh"), "start"],
			env: {
				PATH: process.env.PATH,
				CONTAINER_ENGINE: "/usr/bin/false",
				TRELLIS_CONTAINER_DATA: root,
				TRELLIS_CONTAINER_NAME: "second-host",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(await child.exited).not.toBe(0);
		expect(await new Response(child.stderr).text()).toContain(
			"The data home belongs to container first-host, not second-host.",
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
