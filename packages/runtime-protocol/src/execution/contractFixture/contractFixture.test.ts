import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type LaunchSpec,
	RUNTIME_PROTOCOL_VERSION,
	type RuntimeMethods,
	type RuntimeProcessStatus,
	type RuntimeRequest,
} from "../../index.ts";
import type { ContractLaunchSpec } from "../ContractLaunchSpec";
import type { ExecutionTarget } from "../ExecutionTarget";
import { clientExecutionHost } from "./clientExecutionHost.ts";
import { executionHostContract, FIXTURE_AMBIENT, FIXTURE_TOKEN } from "./contractFixture.ts";
import { scriptedRuntime } from "./scriptedRuntime.ts";

type Message = { hash: string; status: "written" | "unknown"; acknowledged: boolean };
type Session = {
	spec: LaunchSpec;
	fingerprint: string;
	startedAt: string;
	endedAt: string | null;
	output: Buffer;
	messages: Map<string, Message>;
	activity: RuntimeProcessStatus["activity"];
};

const fail = (code: string, message: string) => Object.assign(new Error(message), { code });
const hash = (data: string) => createHash("sha256").update(data).digest("hex");

// A runtime stand-in that behaves like the real one for a `/bin/cat`
// session: every delivered byte comes back as output, one launch per id and
// fingerprint, and a turn with the attempt token acknowledges a message.
class CatRuntime {
	private readonly sessions = new Map<string, Session>();
	constructor(private readonly socketPath: string) {}
	private get(id: string) {
		const session = this.sessions.get(id);
		if (!session) throw fail("SESSION_NOT_FOUND", `Session ${id} does not exist`);
		return session;
	}
	private status(id: string): RuntimeProcessStatus {
		const session = this.get(id);
		const exited = session.endedAt !== null;
		return {
			id,
			daemonId: "scripted",
			pid: exited ? null : 4242,
			mode: session.spec.mode,
			status: exited ? "exited" : "running",
			startedAt: session.startedAt,
			endedAt: session.endedAt,
			exitCode: exited ? 0 : null,
			error: null,
			elapsedMs: 0,
			agent: null,
			result: null,
			acknowledgedMessageIds: [...session.messages].filter(([, m]) => m.acknowledged).map(([id]) => id),
			activity: session.activity,
			checkedAt: new Date().toISOString(),
			controllable: !exited,
			process: null,
			launch: { command: session.spec.command, args: session.spec.args, cwd: session.spec.cwd },
		};
	}
	private write(session: Session, id: string, messageId: string, data: string) {
		const existing = session.messages.get(messageId);
		if (existing) {
			if (existing.hash !== hash(data)) throw new Error(`Message ${messageId} already has different bytes`);
			return { messageId, status: existing.status };
		}
		if (session.endedAt !== null) throw new Error(`Session ${id} is exited`);
		session.output = Buffer.concat([session.output, Buffer.from(data, "base64")]);
		session.messages.set(messageId, { hash: hash(data), status: "written", acknowledged: false });
		return { messageId, status: "written" as const };
	}
	reply(request: RuntimeRequest): unknown {
		const params = request.params as { id: string };
		switch (request.method) {
			case "hello":
				return {
					version: RUNTIME_PROTOCOL_VERSION,
					daemonId: "scripted",
					pid: process.pid,
					startedAt: new Date().toISOString(),
					socketPath: this.socketPath,
					capabilities: ["terminal-stream", "terminal-channel", "list-pages", "queued-input"],
				};
			case "start": {
				const spec = request.params as LaunchSpec;
				const fingerprint = JSON.stringify([spec.command, spec.args, spec.cwd, spec.mode, spec.env, spec.timeoutMs]);
				const existing = this.sessions.get(spec.id);
				if (existing) {
					if (existing.fingerprint !== fingerprint)
						throw fail("LAUNCH_CONFLICT", `Launch ${spec.id} already has a different command`);
					return this.status(spec.id);
				}
				this.sessions.set(spec.id, {
					spec,
					fingerprint,
					startedAt: new Date().toISOString(),
					endedAt: null,
					output: Buffer.alloc(0),
					messages: new Map(),
					activity: null,
				});
				return this.status(spec.id);
			}
			case "inspect":
			case "recover":
				return this.status(params.id);
			case "deliver":
			case "queueInput": {
				const { id, messageId, data } = request.params as RuntimeMethods["deliver"]["params"];
				return this.write(this.get(id), id, messageId, data);
			}
			case "hasMessage": {
				const { id, messageId } = request.params as RuntimeMethods["hasMessage"]["params"];
				const message = this.get(id).messages.get(messageId);
				return {
					messageId,
					registered: message !== undefined,
					delivered: message?.status === "written",
					status: this.status(id).status,
				};
			}
			case "turn": {
				const { id, token, event, messageId } = request.params as RuntimeMethods["turn"]["params"];
				const session = this.get(id);
				if (session.spec.env?.TRELLIS_ATTEMPT_TOKEN !== token)
					throw new Error("The attempt token does not match this process");
				session.activity = {
					state: event === "UserPromptSubmit" ? "working" : "idle",
					updatedAt: new Date().toISOString(),
				};
				if (messageId !== undefined) {
					const message = session.messages.get(messageId);
					if (message) message.acknowledged = true;
				}
				return this.status(id);
			}
			case "stop": {
				const session = this.get(params.id);
				session.endedAt ??= new Date().toISOString();
				return this.status(params.id);
			}
			case "output": {
				const { id, offset } = request.params as RuntimeMethods["output"]["params"];
				const output = this.get(id).output;
				const start = Math.min(offset, output.length);
				return {
					data: output.subarray(start).toString("base64"),
					startOffset: start,
					nextOffset: output.length,
					truncated: false,
				};
			}
			case "listPage":
				return { sessions: [...this.sessions.keys()].map((id) => this.status(id)), nextCursor: null };
			case "shutdown":
				return null;
			default:
				throw new Error(`Unscripted method ${request.method}`);
		}
	}
}

const target: ExecutionTarget = {
	hostId: "01HOST",
	controlId: "01CONTROL",
	controllerOwnerEpoch: 1,
	runId: "01RUN",
	attemptId: "01ATTEMPT",
	generation: 1,
};

executionHostContract(async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-contract-"));
	const runtime = await scriptedRuntime((request) => cat.reply(request));
	const cat = new CatRuntime(runtime.socketPath);
	const binding = { hostId: target.hostId, controlId: target.controlId, controllerOwnerEpoch: 1 };
	return {
		host: clientExecutionHost({
			client: runtime.client,
			binding,
			home,
			url: "http://127.0.0.1:1",
			env: async () => FIXTURE_AMBIENT,
		}),
		client: runtime.client,
		target,
		cwd: home,
		descriptorInput: {
			id: target.attemptId,
			command: "/bin/cat",
			args: [],
			cwd: home,
			mode: "stdio",
			env: {
				TRELLIS_URL: "http://127.0.0.1:1",
				TRELLIS_ACTOR: `agent:${target.runId}`,
				TRELLIS_RUN_ID: target.runId,
				TRELLIS_ATTEMPT_ID: target.attemptId,
				TRELLIS_RUNTIME_HOME: `${home}/runtime`,
				TRELLIS_ATTEMPT_TOKEN: FIXTURE_TOKEN,
			},
		} satisfies ContractLaunchSpec,
		requests: () => runtime.requests.length,
		close: async () => {
			await runtime.close();
			await rm(home, { recursive: true, force: true });
		},
	};
});

test("launch.start rejects when the descriptor file of the attempt holds invalid JSON", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-contract-"));
	const runtime = await scriptedRuntime((request) => cat.reply(request));
	const cat = new CatRuntime(runtime.socketPath);
	const broken: ExecutionTarget = { ...target, attemptId: "01BROKEN" };
	await mkdir(join(home, "harness-attempts", broken.attemptId), { recursive: true });
	await writeFile(join(home, "harness-attempts", broken.attemptId, "launch.json"), "{");
	const host = clientExecutionHost({
		client: runtime.client,
		binding: { hostId: target.hostId, controlId: target.controlId, controllerOwnerEpoch: 1 },
		home,
		url: "http://127.0.0.1:1",
		env: async () => FIXTURE_AMBIENT,
	});
	const spec: ContractLaunchSpec = {
		id: broken.attemptId,
		command: "/bin/cat",
		args: [],
		cwd: home,
		mode: "stdio",
		env: {
			TRELLIS_URL: "http://127.0.0.1:1",
			TRELLIS_ACTOR: `agent:${broken.runId}`,
			TRELLIS_RUN_ID: broken.runId,
			TRELLIS_ATTEMPT_ID: broken.attemptId,
			TRELLIS_RUNTIME_HOME: `${home}/runtime`,
			TRELLIS_ATTEMPT_TOKEN: FIXTURE_TOKEN,
		},
	};
	await expect(host.launch.start(broken, spec)).rejects.toBeInstanceOf(SyntaxError);
	await runtime.close();
	await rm(home, { recursive: true, force: true });
});
