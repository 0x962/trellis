import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { RuntimeClient } from "../../../../../packages/runtime-protocol/src/client.ts";
import { RUNTIME_PROTOCOL_VERSION, type HarnessEvent } from "../../../../../packages/runtime-protocol/src/index.ts";
import { assertProviderDenial } from "../denial/denial.ts";
import { NativeFixturePlanSchema } from "../plan/plan.ts";
import { startControl } from "./components/control/control.ts";
import { createEvidence } from "./components/evidence/evidence.ts";
import { createTurns } from "./components/turns/turns.ts";

const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const env = z.object({
	TRELLIS_NATIVE_FIXTURE_ROOT: z.string().startsWith("/"),
	TRELLIS_HARNESS_SOCKET: z.string().startsWith("/"),
	TRELLIS_ATTEMPT_ID: identifier,
	TRELLIS_ATTEMPT_TOKEN: z.string().min(1),
	TRELLIS_CODEX_CONTROL_SOCKET: z.string().startsWith("/"),
	TRELLIS_CODEX_CONTROL_TOKEN: z.string().min(1),
}).parse(process.env);
const root = env.TRELLIS_NATIVE_FIXTURE_ROOT;
const launch = z
	.object({ prompt: z.string().min(1), cwd: z.string(), sessionId: identifier.optional() })
	.parse(JSON.parse(await readFile(process.argv[2]!, "utf8")));
const planBytes = await readFile(join(root, "plan.json"));
const plan = NativeFixturePlanSchema.parse(JSON.parse(planBytes.toString()));
const planHash = createHash("sha256").update(planBytes).digest("hex");
const evidence = createEvidence(root, env.TRELLIS_ATTEMPT_ID);
await evidence({ kind: "started", ppid: process.ppid, planHash, controlSocket: env.TRELLIS_CODEX_CONTROL_SOCKET });
await evidence({ kind: "network-denial", ...(await assertProviderDenial(plan)) });
const client = new RuntimeClient(env.TRELLIS_HARNESS_SOCKET, plan.requestTimeoutMs);
const hello = await client.hello();
if (hello.version !== RUNTIME_PROTOCOL_VERSION) throw new Error("Runtime protocol does not match the fixture source");
await evidence({ kind: "runtime", daemonId: hello.daemonId, version: hello.version });
const sessionId = launch.sessionId ?? randomUUID();
const statePath = join(root, "sessions", `${sessionId}.json`);
const state = launch.sessionId === undefined
	? { sessionId, planHash, sequence: 0 }
	: z.strictObject({ sessionId: identifier, planHash: z.string(), sequence: z.number().int().nonnegative() })
		.parse(JSON.parse(await readFile(statePath, "utf8")));
if (state.sessionId !== sessionId || state.planHash !== planHash) throw new Error("Resume identity or plan bytes changed");
if (launch.sessionId === undefined) await writeFile(statePath, JSON.stringify(state), { mode: 0o600, flag: "wx" });
const emit = async (event: HarnessEvent) => {
	await client.observe(env.TRELLIS_ATTEMPT_ID, env.TRELLIS_ATTEMPT_TOKEN, event);
	await evidence({ kind: "runtime-ack", eventKind: event.kind, sessionId: event.sessionId, turnId: event.turnId });
};
const turns = createTurns({ plan, state, statePath, emit, evidence });
await mkdir(dirname(env.TRELLIS_CODEX_CONTROL_SOCKET), { mode: 0o700 });
const server = await startControl({
	socket: env.TRELLIS_CODEX_CONTROL_SOCKET,
	token: env.TRELLIS_CODEX_CONTROL_TOKEN,
	sessionId,
	turns,
});
await emit({ kind: "session", sessionId });
await turns.prompt(launch.prompt);
for (const [signal, code] of [["SIGTERM", 143], ["SIGINT", 130]] as const) {
	process.once(signal, () => {
		server.close();
		void evidence({ kind: "signal", signal, sessionId }).finally(() => process.exit(code));
	});
process.on("exit", (code) =>
	process.stdout.write(`${JSON.stringify({ fixture: "nativeExecutable", pid: process.pid, sessionId, exitCode: code })}\n`),
);
