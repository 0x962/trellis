import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { originDir } from "../../../../../../test/originDir.ts";
import { connectHost, type HostConnection, waitForHostExit } from "../../../../src/host/host.ts";
import { pinResources } from "../../../../src/pinnedResources/pinnedResources.ts";

const desktop = resolve(originDir(import.meta.dir), "../..");

test("app removal preserves the runtime and new native children from pinned resources", async () => {
	const directory = await mkdtemp("/tmp/trl-pin-");
	const source = join(directory, "Trellis.app/Contents/Resources/host");
	const home = join(directory, "home");
	let host: HostConnection | undefined;
	let daemon: ReturnType<typeof Bun.spawn> | undefined;
	let runtime: RuntimeClient | undefined;
	try {
		await mkdir(source, { recursive: true });
		await cp(join(desktop, "dist/host"), source, { recursive: true, verbatimSymlinks: true });
		const pinned = await pinResources(source, home);
		const options = {
			home,
			executable: join(pinned.root, "bin/bun"),
			entry: join(pinned.root, "apps/server/src/index.ts"),
			webDist: join(pinned.root, "apps/web/dist"),
			env: {
				PATH: `${join(pinned.root, "bin")}:/usr/bin:/bin`,
				TRELLIS_RUNTIME_NODE: join(pinned.root, "bin/node"),
				TRELLIS_RUNTIME_SCRIPT: join(pinned.root, "apps/runtime/dist/index.js"),
			},
		};
		host = await connectHost(options);
		const runtimeHome = join(home, "runtime");
		daemon = Bun.spawn(
			[join(pinned.root, "bin/node"), join(pinned.root, "apps/runtime/dist/index.js"), "--home", runtimeHome],
			{
				cwd: home,
				env: { PATH: "/usr/bin:/bin" },
				stdout: "ignore",
				stderr: "inherit",
			},
		);
		const deadline = Date.now() + 10000;
		while (!existsSync(join(runtimeHome, "manifest.json")) && Date.now() < deadline) await Bun.sleep(50);
		runtime = new RuntimeClient(join(runtimeHome, "runtime.sock"));
		const first = await runtime.start({
			id: "before-replacement",
			command: "/bin/cat",
			args: [],
			cwd: home,
			mode: "pty",
		});
		const originalDaemon = await runtime.hello();
		await rm(join(directory, "Trellis.app"), { recursive: true });
		await runtime.input(first.id, Buffer.from("app files removed\n").toString("base64"));
		await Bun.sleep(100);
		expect(Buffer.from((await runtime.output(first.id)).data, "base64").toString()).toContain("app files removed");
		const next = await runtime.start({
			id: "after-replacement",
			command: join(pinned.root, "bin/node"),
			args: [
				"--input-type=module",
				"-e",
				'import pty from "node-pty"; import fs from "fs-ext"; if(typeof fs.flockSync !== "function") process.exit(2); const child=pty.spawn("/bin/echo",["pinned native modules work"]); child.onData(data=>process.stdout.write(data)); child.onExit(({exitCode})=>process.exit(exitCode));',
			],
			cwd: join(pinned.root, "apps/runtime"),
			mode: "pty",
		});
		let output = "";
		for (let i = 0; i < 100 && !output.includes("pinned native modules work"); i++) {
			await Bun.sleep(50);
			output = Buffer.from((await runtime.output(next.id)).data, "base64").toString();
		}
		expect(output).toContain("pinned native modules work");
		process.kill(host.pid, "SIGTERM");
		await waitForHostExit(home);
		host = await connectHost(options);
		expect((await runtime.hello()).pid).toBe(originalDaemon.pid);
		expect((await runtime.list()).find((session) => session.id === first.id)?.pid).toBe(first.pid);
		expect((await fetch(host.origin, { headers: { Authorization: `Bearer ${host.token}` } })).status).toBe(200);
	} finally {
		if (daemon) {
			daemon.kill("SIGTERM");
			await daemon.exited;
		}
		if (host) {
			process.kill(host.pid, "SIGTERM");
			await waitForHostExit(home);
		}
		await rm(directory, { recursive: true, force: true });
	}
}, 120000);
