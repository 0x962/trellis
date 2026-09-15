import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installApplication } from "../../../../src/installApplication/installApplication.ts";

test("app replacement removes obsolete resources and leaves a running app process alive", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-install-test-"));
	const source = join(root, "candidate.app");
	const destination = join(root, "Applications/Trellis.app");
	await mkdir(source);
	await mkdir(destination, { recursive: true });
	await writeFile(join(source, "release"), "new");
	await symlink("release", join(source, "current"));
	await writeFile(join(destination, "obsolete"), "old");
	const executable = join(destination, "app");
	await writeFile(executable, "#!/bin/sh\nexec /bin/sleep 60\n", { mode: 0o700 });
	const app = Bun.spawn([executable], { stdout: "ignore", stderr: "pipe" });
	try {
		await installApplication(source, destination);
		expect(await readFile(join(destination, "current"), "utf8")).toBe("new");
		expect(existsSync(join(destination, "obsolete"))).toBe(false);
		expect(await readFile(join(source, "release"), "utf8")).toBe("new");
		expect(app.exitCode).toBeNull();
		expect(() => process.kill(app.pid, 0)).not.toThrow();
	} finally {
		app.kill("SIGTERM");
		await app.exited;
		await rm(root, { recursive: true, force: true });
	}
});

test("first install creates the Applications directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "trellis-first-install-test-"));
	try {
		const source = join(root, "candidate.app");
		const destination = join(root, "Applications/Trellis.app");
		await mkdir(source);
		await writeFile(join(source, "release"), "new");
		await installApplication(source, destination);
		expect(await readFile(join(destination, "release"), "utf8")).toBe("new");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
