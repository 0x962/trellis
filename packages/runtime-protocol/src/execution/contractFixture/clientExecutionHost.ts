import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeClient } from "../../client.ts";
import type { LaunchSpec, RuntimeProcessStatus } from "../../index.ts";
import type { AttemptEnvironment } from "../AttemptEnvironment";
import { assertTarget } from "../assertTarget";
import type { ContractLaunchSpec } from "../ContractLaunchSpec";
import type { ExecutionHost } from "../ExecutionHost";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { HostBinding } from "../HostBinding";
import type { LaunchOutcome } from "../LaunchOutcome";
import { LaunchSpecMismatch } from "../LaunchSpecMismatch";
import type { PreparedLaunch } from "../PreparedLaunch";
import { readAllOutput } from "../readAllOutput";
import { redactLaunchSpec } from "../redactLaunchSpec";
import { startLaunch } from "../startLaunch";

export type ClientExecutionHostInput = {
	client: RuntimeClient;
	binding: HostBinding;
	home: string;
	url: string;
	// The login environment of the host. It goes under the attempt
	// environment of every launch and never into a contract value.
	env: () => Promise<Record<string, string | undefined>>;
};

const defined = (env: Record<string, string | undefined>) =>
	Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));

// The smallest ExecutionHost: one RuntimeClient and a directory tree under
// `home` with the layout of a Trellis data home. `prepare.descriptor` takes a
// ContractLaunchSpec and records the full spec with the JSON of the input as
// its fingerprint. The contract test runs this host over a scripted runtime,
// so a defect in the contract fixture shows without a server.
export function clientExecutionHost({ client, binding, home, url, env }: ClientExecutionHostInput): ExecutionHost {
	const descriptorPath = (target: ExecutionTarget) => join(home, "harness-attempts", target.attemptId, "launch.json");
	const capturePath = (target: ExecutionTarget) => join(home, "agents", target.runId, `output-${target.attemptId}.txt`);
	const attemptEnvironment = (target: ExecutionTarget, token: string): AttemptEnvironment => ({
		TRELLIS_URL: url,
		TRELLIS_ACTOR: `agent:${target.runId}`,
		TRELLIS_RUN_ID: target.runId,
		TRELLIS_ATTEMPT_ID: target.attemptId,
		TRELLIS_RUNTIME_HOME: join(home, "runtime"),
		TRELLIS_ATTEMPT_TOKEN: token,
	});
	const fullSpec = async (spec: ContractLaunchSpec): Promise<LaunchSpec> => ({
		...spec,
		env: { ...defined(await env()), ...spec.env },
	});
	const readRecord = async (target: ExecutionTarget): Promise<{ spec: LaunchSpec; fingerprint: string }> =>
		JSON.parse(await readFile(descriptorPath(target), "utf8"));
	const redact = ({ spec, fingerprint }: { spec: LaunchSpec; fingerprint: string }): PreparedLaunch => ({
		spec: redactLaunchSpec(spec),
		fingerprint,
	});
	const writeRecord = async (target: ExecutionTarget, spec: LaunchSpec, fingerprint: string) => {
		await mkdir(dirname(descriptorPath(target)), { recursive: true });
		await writeFile(descriptorPath(target), JSON.stringify({ spec, fingerprint }));
		return redact({ spec, fingerprint });
	};
	const descriptorFingerprint = (target: ExecutionTarget) =>
		readRecord(target).then(
			(record) => record.fingerprint,
			() => null,
		);
	const start = (target: ExecutionTarget, spec: LaunchSpec, fingerprint: () => Promise<string | null>) =>
		startLaunch((full) => client.start(full), target, spec, fingerprint);
	const base64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
	const frame = (messageId: string, text: string) => Buffer.from(`trellis-message:${messageId}\n${text}`);
	const waitFor = async (
		target: ExecutionTarget,
		matches: (session: RuntimeProcessStatus) => boolean,
		signal?: AbortSignal,
	) => {
		for await (const event of client.subscribeSession(target.attemptId, signal))
			if (event.type === "session" && matches(event.session)) return event.session;
		throw new Error(`Attempt ${target.attemptId} closed before the awaited state`);
	};
	return {
		binding,
		health: { hello: (signal) => client.hello(signal) },
		prepare: {
			async workspace(target, _input) {
				assertTarget(binding, target);
				const workspaceId = join(home, "agents", target.runId, "work");
				await mkdir(workspaceId, { recursive: true });
				return { workspaceId };
			},
			async descriptor(target, input) {
				assertTarget(binding, target);
				const spec = input as ContractLaunchSpec;
				if (spec.id !== target.attemptId) throw new LaunchSpecMismatch(target.attemptId, spec.id);
				return writeRecord(target, await fullSpec(spec), JSON.stringify(spec));
			},
			async custom(target, input) {
				assertTarget(binding, target);
				const spec: ContractLaunchSpec = {
					id: target.attemptId,
					command: "/bin/sh",
					args: ["-c", input.command],
					cwd: input.cwd,
					env: attemptEnvironment(target, input.token),
					mode: "stdio",
					timeoutMs: input.timeoutMs,
				};
				return (await writeRecord(target, await fullSpec(spec), JSON.stringify(spec))).spec;
			},
		},
		launch: {
			async start(target, spec) {
				assertTarget(binding, target);
				return start(target, await fullSpec(spec), () => descriptorFingerprint(target));
			},
			async startPrepared(target, timeoutMs) {
				assertTarget(binding, target);
				const { spec, fingerprint } = await readRecord(target);
				return start(target, timeoutMs === undefined ? spec : { ...spec, timeoutMs }, async () => fingerprint);
			},
			async confirmed(target, input, mode): Promise<LaunchOutcome> {
				assertTarget(binding, target);
				const spec = input as ContractLaunchSpec;
				if (spec.id !== target.attemptId) throw new LaunchSpecMismatch(target.attemptId, spec.id);
				const outcome = await start(target, await fullSpec(spec), () => descriptorFingerprint(target));
				if (outcome.kind === "unknown") return outcome;
				const session = await client.inspect(target.attemptId);
				if (mode.kind === "resume" && session.agent?.sessionId !== mode.sessionId)
					throw new Error(
						`Attempt ${target.attemptId} resumed ${session.agent?.sessionId}, expected ${mode.sessionId}`,
					);
				return { ...outcome, session };
			},
		},
		observe: {
			async inspect(target) {
				assertTarget(binding, target);
				return client.inspect(target.attemptId);
			},
			async recover(target) {
				assertTarget(binding, target);
				return client.recover(target.attemptId);
			},
			list: (input, signal) => client.list(input, signal),
			session(target, signal) {
				assertTarget(binding, target);
				return client.subscribeSession(target.attemptId, signal);
			},
			async waitFor(target, matches, options = {}) {
				assertTarget(binding, target);
				return waitFor(target, matches, options.signal);
			},
		},
		input: {
			async raw(target, data, userInput, expected) {
				assertTarget(binding, target);
				return client.input(target.attemptId, base64(data), userInput, expected);
			},
			async deliver(target, messageId, data, expected) {
				assertTarget(binding, target);
				return client.deliver(target.attemptId, messageId, base64(data), expected);
			},
			async queue(target, messageId, data) {
				assertTarget(binding, target);
				return client.queueInput(target.attemptId, messageId, base64(data));
			},
			async receipt(target, messageId) {
				assertTarget(binding, target);
				return client.hasMessage(target.attemptId, messageId);
			},
			async awaitReceipt(target, messageId, timeoutMs) {
				assertTarget(binding, target);
				return waitFor(
					target,
					(session) => session.acknowledgedMessageIds.includes(messageId),
					AbortSignal.timeout(timeoutMs),
				);
			},
			async resize(target, cols, rows) {
				assertTarget(binding, target);
				return client.resize(target.attemptId, cols, rows);
			},
			async send(target, messageId, text, expected) {
				assertTarget(binding, target);
				await client.deliver(target.attemptId, messageId, base64(frame(messageId, text)), expected);
				return client.inspect(target.attemptId);
			},
			async sendAtTurnBoundary(target, messageId, text) {
				assertTarget(binding, target);
				await client.queueInput(target.attemptId, messageId, base64(frame(messageId, text)));
				return client.inspect(target.attemptId);
			},
			async interrupt(target) {
				assertTarget(binding, target);
				await client.input(target.attemptId, base64(Buffer.from("\u0003")));
				return client.inspect(target.attemptId);
			},
		},
		stop: {
			async stop(target) {
				assertTarget(binding, target);
				return client.stop(target.attemptId);
			},
			shutdown: () => client.shutdown(),
		},
		files: {
			async descriptor(target) {
				assertTarget(binding, target);
				return redact(await readRecord(target));
			},
			capturePath(target) {
				assertTarget(binding, target);
				return capturePath(target);
			},
			async captureExists(target) {
				assertTarget(binding, target);
				return Bun.file(capturePath(target)).exists();
			},
			async writeCapture(target, text) {
				assertTarget(binding, target);
				await mkdir(dirname(capturePath(target)), { recursive: true });
				await writeFile(capturePath(target), text);
			},
			workspacePath(target) {
				assertTarget(binding, target);
				return join(home, "agents", target.runId, "work");
			},
		},
		transcript: {
			async output(target, offset, stream) {
				assertTarget(binding, target);
				return client.output(target.attemptId, offset, stream);
			},
			async readAll(target, stream) {
				assertTarget(binding, target);
				return readAllOutput(client, target.attemptId, stream);
			},
			subscribe(target, offset, stream, signal) {
				assertTarget(binding, target);
				return client.subscribe(target.attemptId, offset, signal, stream);
			},
		},
		terminal: {
			channel(target, offset, signal) {
				assertTarget(binding, target);
				return client.terminal(target.attemptId, offset, signal);
			},
			binaryChannel: async () => (await client.hello()).capabilities?.includes("terminal-channel") === true,
		},
	};
}
