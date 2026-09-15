import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RuntimeClient } from "@trellis/runtime-protocol/client";
import { connectHost } from "../src/host/host.ts";
import { pinResources } from "../src/pinnedResources/pinnedResources.ts";

const source = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dir, "../dist/host");
const directory = await mkdtemp("/tmp/trl-smoke-");
const home = join(directory, "home");
let pid: number | undefined;
let daemon: ReturnType<typeof Bun.spawn> | undefined;
try {
	const { root: staged } = await pinResources(source, directory);
	const options = {
		home,
		executable: join(staged, "bin/bun"),
		entry: join(staged, "apps/server/src/index.ts"),
		webDist: join(staged, "apps/web/dist"),
		env: {
			PATH: `${join(staged, "bin")}:/usr/bin:/bin`,
			TRELLIS_RUNTIME_NODE: join(staged, "bin/node"),
			TRELLIS_RUNTIME_SCRIPT: join(staged, "apps/runtime/dist/index.js"),
		},
	};
	const host = await connectHost(options);
	pid = host.pid;
	const headers = { Authorization: `Bearer ${host.token}` };
	assert.equal((await fetch(`${host.origin}/api/health`, { headers })).status, 200);
	assert.equal((await fetch(`${host.origin}/api/health`)).status, 401);
	assert.match(await (await fetch(host.origin, { headers })).text(), /<html/);
	const cli = Bun.spawn([join(staged, "bin/trellis"), "list", "--json"], {
		cwd: home,
		env: { PATH: `${join(staged, "bin")}:/usr/bin:/bin`, TRELLIS_URL: host.origin, TRELLIS_AUTH_TOKEN: host.token },
		stdout: "pipe",
		stderr: "pipe",
	});
	assert.equal(await cli.exited, 0, await new Response(cli.stderr).text());
	const node = Bun.spawn(
		[
			join(staged, "bin/node"),
			"--input-type=module",
			"-e",
			'import pty from "node-pty"; import {load} from "koffi"; if(load(null).func("int getpid()")() !== process.pid) process.exit(2); const t = pty.spawn("/bin/echo", ["trellis-packaged-pty"]); t.onData(data => process.stdout.write(data)); t.onExit(({exitCode}) => process.exit(exitCode));',
		],
		{ cwd: join(staged, "apps/runtime"), env: { PATH: "/usr/bin:/bin" }, stdout: "pipe", stderr: "pipe" },
	);
	const output = await new Response(node.stdout).text();
	assert.equal(await node.exited, 0, await new Response(node.stderr).text());
	assert.match(output, /trellis-packaged-pty/);
	const runtimeHome = join(home, "runtime");
	daemon = Bun.spawn([join(staged, "bin/node"), join(staged, "apps/runtime/dist/index.js"), "--home", runtimeHome], {
		cwd: home,
		env: { PATH: "/usr/bin:/bin" },
		stdout: "ignore",
		stderr: "inherit",
	});
	const deadline = Date.now() + 10000;
	while (!existsSync(join(runtimeHome, "manifest.json")) && Date.now() < deadline) await Bun.sleep(50);
	const runtime = new RuntimeClient(join(runtimeHome, "runtime.sock"));
	const running = await runtime.start({
		id: "desktop-restart-probe",
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "pty",
	});
	process.kill(pid, "SIGTERM");
	pid = undefined;
	await Bun.sleep(1000);
	const restarted = await connectHost(options);
	pid = restarted.pid;
	assert.equal(restarted.origin, host.origin);
	assert.equal((await runtime.list())[0]?.pid, running.pid);
	await runtime.input(running.id, Buffer.from("survived-host-restart\n").toString("base64"));
	await Bun.sleep(100);
	assert.match(Buffer.from((await runtime.output(running.id)).data, "base64").toString(), /survived-host-restart/);
	await runtime.stop(running.id);
	console.log(
		JSON.stringify(
			{
				workerDatabase: "pass",
				authenticatedHost: "pass",
				rendererAssets: "pass",
				bundledCli: "pass",
				bundledPty: "pass",
				bundledProcessOwnership: "pass",
				ptySurvivesHostRestart: "pass",
				stableRendererOrigin: "pass",
				build: JSON.parse(await readFile(join(staged, "build.json"), "utf8")),
			},
			null,
			2,
		),
	);
} finally {
	if (daemon) {
		daemon.kill("SIGTERM");
		await daemon.exited;
	}
	if (pid) process.kill(pid, "SIGTERM");
	await Bun.sleep(1000);
	await rm(directory, { recursive: true, force: true });
}
