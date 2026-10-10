import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeClient } from "../../client.ts";
import type { LaunchSpec, RuntimeProcessStatus } from "../../index.ts";
import type { AttemptEnvironment } from "../AttemptEnvironment";
import { assertTarget } from "../assertTarget";
import type { ExecutionHost } from "../ExecutionHost";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { HostBinding } from "../HostBinding";
import type { PreparedLaunch } from "../PreparedLaunch";
import { readAllOutput } from "../readAllOutput";
import { startLaunch } from "../startLaunch";

export type ClientExecutionHostInput = { client: RuntimeClient; binding: HostBinding; home: string; url: string };

// The smallest ExecutionHost: one RuntimeClient and a directory tree under
// `home` with the layout of a Trellis data home. `prepare.descriptor` takes a
// LaunchSpec and records it with the JSON of the spec as its fingerprint.
// The contract test runs this host over a scripted runtime, so a defect in
// the contract fixture shows without a server.
export function clientExecutionHost({ client, binding, home, url }: ClientExecutionHostInput): ExecutionHost {
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
	const readDescriptor = async (target: ExecutionTarget): Promise<PreparedLaunch> =>
		JSON.parse(await readFile(descriptorPath(target), "utf8"));
	const descriptorFingerprint = (target: ExecutionTarget) =>
		readDescriptor(target).then(
			(record) => record.fingerprint,
			() => null,
		);
	const base64 = (data: Uint8Array) => Buffer.from(data).toString("base64");
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
				const spec = input as LaunchSpec;
				const record: PreparedLaunch = { spec, fingerprint: JSON.stringify(spec) };
				await mkdir(dirname(descriptorPath(target)), { recursive: true });
				await writeFile(descriptorPath(target), JSON.stringify(record));
				return record;
			},
			async custom(target, input) {
				assertTarget(binding, target);
				return {
					id: target.attemptId,
					command: "/bin/sh",
					args: ["-c", input.command],
					cwd: input.cwd,
					env: attemptEnvironment(target, input.token),
					mode: "stdio",
					timeoutMs: input.timeoutMs,
				};
			},
		},
		launch: {
			async start(target, spec) {
				assertTarget(binding, target);
				return startLaunch(client, target, spec, () => descriptorFingerprint(target));
			},
			async startPrepared(target, timeoutMs) {
				assertTarget(binding, target);
				const { spec } = await readDescriptor(target);
				return startLaunch(client, target, timeoutMs === undefined ? spec : { ...spec, timeoutMs }, () =>
					descriptorFingerprint(target),
				);
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
				return readDescriptor(target);
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
