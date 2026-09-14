import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { originDir } from "../../../../../../test/originDir.ts";
import { adoptHost, assertHostStopped, assertManagedHome, connectHost } from "../../../../src/host/host.ts";

const root = resolve(originDir(import.meta.dir), "../../../..");

test("a desktop host opens a worker database and reconnects to its existing owner", async () => {
	const home = await mkdtemp(`${tmpdir()}/trellis-desktop-host-`);
	let pid: number | undefined;
	try {
		const options = {
			home,
			executable: process.execPath,
			entry: resolve(root, "apps/server/src/index.ts"),
			webDist: resolve(root, "apps/web/dist"),
		};
		const first = await connectHost(options);
		pid = first.pid;
		expect(() => assertManagedHome(home)).toThrow("An unmanaged host owns this data home");
		await expect(adoptHost(home)).rejects.toThrow("An unmanaged host owns this data home");
		await Bun.write(`${home}/desktop-service.pid`, String(first.pid));
		expect(() => assertHostStopped(home)).toThrow("already owns this data home");
		const second = await connectHost(options);
		expect(second.pid).toBe(first.pid);
		expect(second.origin).toBe(first.origin);
		expect((await stat(`${home}/desktop-token`)).mode & 0o777).toBe(0o600);
		expect(await readFile(`${home}/desktop-token`, "utf8")).toBe(first.token);
		const response = await fetch(`${first.origin}/api/health`, { headers: { Authorization: `Bearer ${first.token}` } });
		expect(response.status).toBe(200);
		expect((await fetch(`${first.origin}/api/health`)).status).toBe(401);
		expect((await response.json()).bootId).toBeDefined();
	} finally {
		if (pid) process.kill(pid, "SIGTERM");
		await Bun.sleep(1000);
		await rm(home, { recursive: true, force: true });
	}
}, 60000);

test("a second desktop waits for an existing host during its cold boot", async () => {
	const home = await mkdtemp(`${tmpdir()}/trellis-desktop-adoption-`);
	await Bun.write(`${home}/desktop-token`, "fixture-token");
	const child = Bun.spawn([process.execPath, resolve(root, "apps/desktop/test/fixtures/bootingHost.ts")], {
		env: { ...process.env, TRELLIS_HOME: home },
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		await child.stdout.getReader().read();
		const connection = await connectHost({ home, executable: "/does-not-exist", entry: "unused", webDist: "unused" });
		expect(connection.pid).toBe(child.pid);
	} finally {
		child.kill();
		await child.exited;
		await rm(home, { recursive: true, force: true });
	}
});
