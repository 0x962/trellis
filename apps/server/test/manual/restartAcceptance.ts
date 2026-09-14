import { execFileSync, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createTrellisClient } from "@trellis/api";
import { RuntimeClient } from "@trellis/runtime-protocol/client";

const root = process.argv[2];
if (!root?.startsWith("/tmp/trl-real-")) throw new Error("Supply the scratch /tmp/trl-real-* directory.");
const state = JSON.parse(await readFile(join(root, "state.json"), "utf8"));
const source = resolve(import.meta.dir, "../../../..");
const client = createTrellisClient(state.url, "human:acceptance", (request, init) => {
	request.headers.set("authorization", `Bearer ${state.token}`);
	return fetch(request, init);
});
const before = await client.agentRuns.list({ project: state.projectId });
const runtime = new RuntimeClient(join(state.home, "runtime/runtime.sock"));
const runtimeBefore = await runtime.hello();
const command = execFileSync("ps", ["-p", String(state.pid), "-o", "command="], { encoding: "utf8" });
if (!command.includes(join(source, "apps/server/src/index.ts")))
	throw new Error("The recorded PID is not this source host.");
process.kill(state.pid, "SIGTERM");
let alive = true;
for (let n = 0; n < 200 && alive; n++) {
	await Bun.sleep(50);
	try {
		process.kill(state.pid, 0);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
		alive = false;
	}
}
if (alive) throw new Error("The scratch host did not stop; its runtime remains untouched.");
const logfile = join(root, "host-restart.log");
const log = openSync(logfile, "a", 0o600);
const child = spawn(process.execPath, [join(source, "apps/server/src/index.ts")], {
	cwd: join(source, "apps/server"),
	detached: true,
	stdio: ["ignore", log, log],
	env: {
		...process.env,
		NODE_ENV: "production",
		TRELLIS_HOME: state.home,
		TRELLIS_PORT: new URL(state.url).port,
		TRELLIS_AUTH_TOKEN: state.token,
		TRELLIS_DB_INLINE: "false",
		TRELLIS_GH_BIN: "/usr/bin/false",
		TRELLIS_RUNTIME_SOCKET: join(state.home, "runtime/runtime.sock"),
		TRELLIS_CLAUDE_BIN: join(root, "bin/claude-acceptance"),
		TRELLIS_CLOCK_RATE: "1",
		PATH: `${join(root, "bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
		CLAUDE_CODE_SAFE_MODE: "1",
	},
});
closeSync(log);
child.unref();
state.pid = child.pid;
await writeFile(join(root, "state.json"), JSON.stringify(state, null, 2), { mode: 0o600 });
let listening = false;
for (let n = 0; n < 300 && !listening; n++) {
	await Bun.sleep(100);
	const output = await readFile(logfile, "utf8");
	listening = output.includes('"msg":"listening"');
}
if (!listening) throw new Error(`The scratch host did not restart. Read ${logfile}.`);
const after = await client.agentRuns.list({ project: state.projectId });
const runtimeAfter = await runtime.hello();
const sameRuns =
	JSON.stringify(before.map((run) => run.id).sort()) === JSON.stringify(after.map((run) => run.id).sort());
const result = {
	action: "host-restart",
	at: new Date().toISOString(),
	pid: state.pid,
	sameRuns,
	sameRuntime: runtimeBefore.pid === runtimeAfter.pid && runtimeBefore.daemonId === runtimeAfter.daemonId,
	runs: after.map((run) => ({ id: run.id, terminalId: run.terminalId, state: run.state })),
};
await appendFile(join(root, "events.jsonl"), `${JSON.stringify(result)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!sameRuns || !result.sameRuntime) throw new Error("The restart changed the runs or runtime.");
