import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeClient } from "../../client.ts";
import { type LaunchSpec, RUNTIME_PROTOCOL_VERSION, type RuntimeOutput } from "../../index.ts";
import { AttemptEnvironmentSchema } from "../AttemptEnvironment";
import type { ExecutionHost } from "../ExecutionHost";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { LaunchReceipt } from "../LaunchOutcome";

export type ContractSubject = {
	host: ExecutionHost;
	// The raw client of the same runtime. The fixture speaks `turn` with the
	// attempt token, the way a harness hook does.
	client: Pick<RuntimeClient, "turn">;
	target: ExecutionTarget;
	// The directory the launched process starts in.
	cwd: string;
	// How many requests reached the runtime socket so far.
	requests(): number;
	close(): Promise<void>;
};

export const FIXTURE_TOKEN = "fixture-attempt-token";
const BEARER = "fixture-bearer";
const decode = (output: RuntimeOutput) => Buffer.from(output.data, "base64").toString("utf8");
const bytes = (text: string) => new TextEncoder().encode(text);

// Registers the execution host contract as bun:test cases. `make` runs once
// before the first case and `close` runs after the last one. The cases run
// in order and share one `/bin/cat` session: cat writes every input byte to
// its output, so the transcript proves each delivery.
export function executionHostContract(make: () => Promise<ContractSubject>): void {
	let subject: ContractSubject;
	let spec: LaunchSpec;
	let receipt: LaunchReceipt;
	let inspected: Awaited<ReturnType<ExecutionHost["observe"]["inspect"]>>;
	let output: RuntimeOutput;
	let transcript: string;
	const outputUntil = async (end: number) => {
		const deadline = Date.now() + 5000;
		let current = await subject.host.transcript.output(subject.target, 0);
		while (current.nextOffset < end && Date.now() < deadline) {
			await Bun.sleep(20);
			current = await subject.host.transcript.output(subject.target, 0);
		}
		return current;
	};

	beforeAll(async () => {
		subject = await make();
		spec = {
			id: subject.target.attemptId,
			command: "/bin/cat",
			args: [],
			cwd: subject.cwd,
			mode: "stdio",
			// The spec carries a bearer and the PATH of this process on purpose.
			// Case 7 proves that no contract value echoes either.
			env: { TRELLIS_ATTEMPT_TOKEN: FIXTURE_TOKEN, TRELLIS_AUTH_TOKEN: BEARER, PATH: process.env.PATH! },
		};
	});
	afterAll(() => subject.close());

	test("1. health.hello answers with the protocol version", async () => {
		expect((await subject.host.health.hello()).version).toBe(RUNTIME_PROTOCOL_VERSION);
	});

	test("2. launch.start is idempotent per spec and refuses another spec", async () => {
		const outcome = await subject.host.launch.start(subject.target, spec);
		expect(outcome.kind).toBe("receipt");
		receipt = outcome as LaunchReceipt;
		expect(receipt.target).toEqual(subject.target);
		expect(receipt.session.id).toBe(subject.target.attemptId);
		const again = (await subject.host.launch.start(subject.target, spec)) as LaunchReceipt;
		expect(again.kind).toBe("receipt");
		expect(again.session.startedAt).toBe(receipt.session.startedAt);
		await expect(subject.host.launch.start(subject.target, { ...spec, args: ["-n"] })).rejects.toMatchObject({
			code: "LAUNCH_CONFLICT",
		});
	}, 15_000);

	test("3. input.deliver writes once and the transcript holds the bytes", async () => {
		expect(await subject.host.input.deliver(subject.target, "first", bytes("hello\n"))).toEqual({
			messageId: "first",
			status: "written",
		});
		output = await outputUntil(6);
		expect(output.startOffset).toBe(0);
		expect(output.nextOffset).toBe(6);
		expect(decode(output)).toBe("hello\n");
		expect(await subject.host.input.receipt(subject.target, "first")).toMatchObject({
			messageId: "first",
			registered: true,
			delivered: true,
		});
		await expect(subject.host.input.deliver(subject.target, "first", bytes("other\n"))).rejects.toThrow(
			"already has different bytes",
		);
	}, 15_000);

	test("4. input.queue flushes to an idle session and a turn acknowledges it", async () => {
		expect(await subject.host.input.queue(subject.target, "second", bytes("second\n"))).toEqual({
			messageId: "second",
			status: "written",
		});
		await subject.client.turn(subject.target.attemptId, FIXTURE_TOKEN, "UserPromptSubmit", "second");
		inspected = await subject.host.observe.inspect(subject.target);
		expect(inspected.acknowledgedMessageIds).toContain("second");
		expect(decode(await outputUntil(13))).toBe("hello\nsecond\n");
	}, 15_000);

	test("5. stop.stop exits the session and transcript.readAll holds every byte", async () => {
		const stopped = await subject.host.stop.stop(subject.target);
		expect(stopped.id).toBe(subject.target.attemptId);
		expect(stopped.status).toBe("exited");
		transcript = await subject.host.transcript.readAll(subject.target);
		expect(transcript).toBe("hello\nsecond\n");
	}, 15_000);

	test("6. every operation refuses a foreign target before any request", async () => {
		const { host, target, cwd } = subject;
		const foreign: ExecutionTarget[] = [
			{ ...target, hostId: `${target.hostId}-other` },
			{ ...target, controlId: `${target.controlId}-other` },
			{ ...target, controllerOwnerEpoch: target.controllerOwnerEpoch + 1 },
		];
		const operations: ((t: ExecutionTarget) => unknown)[] = [
			(t) => host.prepare.workspace(t, { run: undefined, directory: cwd }),
			(t) => host.prepare.descriptor(t, spec),
			(t) => host.prepare.custom(t, { command: "true", cwd, token: FIXTURE_TOKEN }),
			(t) => host.launch.start(t, spec),
			(t) => host.launch.startPrepared(t),
			(t) => host.observe.inspect(t),
			(t) => host.observe.recover(t),
			(t) => host.observe.session(t),
			(t) => host.observe.waitFor(t, () => true),
			(t) => host.input.raw(t, bytes("x")),
			(t) => host.input.deliver(t, "m", bytes("x")),
			(t) => host.input.queue(t, "m", bytes("x")),
			(t) => host.input.receipt(t, "m"),
			(t) => host.input.awaitReceipt(t, "m", 10),
			(t) => host.input.resize(t, 1, 1),
			(t) => host.stop.stop(t),
			(t) => host.files.descriptor(t),
			(t) => host.files.capturePath(t),
			(t) => host.files.captureExists(t),
			(t) => host.files.writeCapture(t, ""),
			(t) => host.files.workspacePath(t),
			(t) => host.transcript.output(t, 0),
			(t) => host.transcript.readAll(t),
			(t) => host.transcript.subscribe(t, 0),
			(t) => host.terminal.channel(t, 0),
		];
		const before = subject.requests();
		for (const t of foreign)
			for (const operation of operations)
				await expect((async () => operation(t))()).rejects.toMatchObject({
					code: "EXECUTION_TARGET_MISMATCH",
					expected: host.binding,
					actual: { hostId: t.hostId, controlId: t.controlId, controllerOwnerEpoch: t.controllerOwnerEpoch },
				});
		expect(subject.requests()).toBe(before);
	});

	test("7. no contract value carries the bearer or the login environment", () => {
		const valid = {
			TRELLIS_URL: "http://127.0.0.1:1",
			TRELLIS_ACTOR: "agent:run",
			TRELLIS_RUN_ID: "run",
			TRELLIS_ATTEMPT_ID: subject.target.attemptId,
			TRELLIS_RUNTIME_HOME: "/tmp/runtime",
			TRELLIS_ATTEMPT_TOKEN: FIXTURE_TOKEN,
		};
		expect(AttemptEnvironmentSchema.safeParse(valid).success).toBe(true);
		expect(AttemptEnvironmentSchema.safeParse({ ...valid, TRELLIS_AUTH_TOKEN: "x" }).success).toBe(false);
		for (const value of [receipt, inspected, output, transcript]) {
			const text = JSON.stringify(value);
			expect(text).not.toContain("TRELLIS_AUTH_TOKEN");
			expect(text).not.toContain(BEARER);
			expect(text).not.toContain(process.env.PATH!);
		}
	});
}
