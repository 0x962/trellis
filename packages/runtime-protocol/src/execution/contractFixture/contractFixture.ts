import { afterAll, beforeAll, expect, test } from "bun:test";
import type { RuntimeClient } from "../../client.ts";
import { RUNTIME_PROTOCOL_VERSION, type RuntimeOutput } from "../../index.ts";
import { AttemptEnvironmentSchema } from "../AttemptEnvironment";
import type { ContractLaunchSpec } from "../ContractLaunchSpec";
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
	// A valid input of `prepare.descriptor` for this host, when the host can
	// prepare one without a harness binary. Case 7 redacts it.
	descriptorInput?: unknown;
	// How many requests reached the runtime socket so far.
	requests(): number;
	close(): Promise<void>;
};

export const FIXTURE_TOKEN = "fixture-attempt-token";
export const FIXTURE_BEARER = "fixture-bearer";
// The login environment every subject gives its host. It carries the master
// bearer and the PATH of this process, so case 7 proves that no contract
// value echoes the environment of the host.
export const FIXTURE_AMBIENT: Record<string, string> = {
	TRELLIS_AUTH_TOKEN: FIXTURE_BEARER,
	PATH: process.env.PATH!,
};
const decode = (output: RuntimeOutput) => Buffer.from(output.data, "base64").toString("utf8");
const bytes = (text: string) => new TextEncoder().encode(text);

// Registers the execution host contract as bun:test cases. `make` runs once
// before the first case and `close` runs after the last one. The cases run
// in order and share one `/bin/cat` session: cat writes every input byte to
// its output, so the transcript proves each delivery.
export function executionHostContract(make: () => Promise<ContractSubject>): void {
	let subject: ContractSubject | undefined;
	let spec: ContractLaunchSpec;
	let receipt: LaunchReceipt;
	let inspected: Awaited<ReturnType<ExecutionHost["observe"]["inspect"]>>;
	let output: RuntimeOutput;
	let transcript: string;
	const outputUntil = async (end: number) => {
		const deadline = Date.now() + 5000;
		let current = await subject!.host.transcript.output(subject!.target, 0);
		while (current.nextOffset < end && Date.now() < deadline) {
			await Bun.sleep(20);
			current = await subject!.host.transcript.output(subject!.target, 0);
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
			env: {
				TRELLIS_URL: "http://127.0.0.1:1",
				TRELLIS_ACTOR: `agent:${subject.target.runId}`,
				TRELLIS_RUN_ID: subject.target.runId,
				TRELLIS_ATTEMPT_ID: subject.target.attemptId,
				TRELLIS_RUNTIME_HOME: `${subject.cwd}/runtime`,
				TRELLIS_ATTEMPT_TOKEN: FIXTURE_TOKEN,
			},
		};
	});
	// A `make` that failed leaves no subject, and the runner of the fixture
	// owns the cleanup of what it started.
	afterAll(() => subject?.close());

	test("1. health.hello answers with the protocol version", async () => {
		expect((await subject!.host.health.hello()).version).toBe(RUNTIME_PROTOCOL_VERSION);
	});

	test("2. launch.start is idempotent per spec and refuses another spec", async () => {
		const { host, target } = subject!;
		const outcome = await host.launch.start(target, spec);
		expect(outcome.kind).toBe("receipt");
		receipt = outcome as LaunchReceipt;
		expect(receipt.target).toEqual(target);
		expect(receipt.session.id).toBe(target.attemptId);
		const again = (await host.launch.start(target, spec)) as LaunchReceipt;
		expect(again.kind).toBe("receipt");
		expect(again.session.startedAt).toBe(receipt.session.startedAt);
		await expect(host.launch.start(target, { ...spec, args: ["-n"] })).rejects.toMatchObject({
			code: "LAUNCH_CONFLICT",
		});
		await expect(host.launch.start(target, { ...spec, id: "other" })).rejects.toMatchObject({
			code: "EXECUTION_SPEC_MISMATCH",
		});
	}, 15_000);

	test("3. input.deliver writes once and the transcript holds the bytes", async () => {
		const { host, target } = subject!;
		expect(await host.input.deliver(target, "first", bytes("hello\n"))).toEqual({
			messageId: "first",
			status: "written",
		});
		output = await outputUntil(6);
		expect(output.startOffset).toBe(0);
		expect(output.nextOffset).toBe(6);
		expect(decode(output)).toBe("hello\n");
		expect(await host.input.receipt(target, "first")).toMatchObject({
			messageId: "first",
			registered: true,
			delivered: true,
		});
		await expect(host.input.deliver(target, "first", bytes("other\n"))).rejects.toThrow("already has different bytes");
	}, 15_000);

	test("4. input.queue flushes to an idle session and a turn acknowledges it", async () => {
		const { host, target, client } = subject!;
		expect(await host.input.queue(target, "second", bytes("second\n"))).toEqual({
			messageId: "second",
			status: "written",
		});
		await client.turn(target.attemptId, FIXTURE_TOKEN, "UserPromptSubmit", "second");
		inspected = await host.observe.inspect(target);
		expect(inspected.acknowledgedMessageIds).toContain("second");
		expect(decode(await outputUntil(13))).toBe("hello\nsecond\n");
	}, 15_000);

	test("5. stop.stop exits the session and transcript.readAll holds every byte", async () => {
		const { host, target } = subject!;
		const stopped = await host.stop.stop(target);
		expect(stopped.id).toBe(target.attemptId);
		expect(stopped.status).toBe("exited");
		transcript = await host.transcript.readAll(target);
		expect(transcript).toBe("hello\nsecond\n");
	}, 15_000);

	test("6. every operation refuses a foreign target before any request", async () => {
		const { host, target, cwd } = subject!;
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
			(t) => host.launch.confirmed(t, spec, { kind: "start" }),
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
			(t) => host.input.send(t, "m", "x"),
			(t) => host.input.sendAtTurnBoundary(t, "m", "x"),
			(t) => host.input.interrupt(t),
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
		const before = subject!.requests();
		for (const t of foreign)
			for (const operation of operations)
				await expect((async () => operation(t))()).rejects.toMatchObject({
					code: "EXECUTION_TARGET_MISMATCH",
					expected: host.binding,
					actual: { hostId: t.hostId, controlId: t.controlId, controllerOwnerEpoch: t.controllerOwnerEpoch },
				});
		expect(subject!.requests()).toBe(before);
	});

	test("7. no contract value carries the bearer or the login environment", async () => {
		const { host, target, cwd, descriptorInput } = subject!;
		expect(AttemptEnvironmentSchema.safeParse(spec.env).success).toBe(true);
		expect(AttemptEnvironmentSchema.safeParse({ ...spec.env, TRELLIS_AUTH_TOKEN: "x" }).success).toBe(false);
		const custom = await host.prepare.custom(target, { command: "true", cwd, token: FIXTURE_TOKEN });
		expect(custom.id).toBe(target.attemptId);
		const record = await host.files.descriptor(target);
		expect(record.spec.id).toBe(target.attemptId);
		const prepared = descriptorInput === undefined ? null : await host.prepare.descriptor(target, descriptorInput);
		if (prepared !== null) expect(prepared.spec.id).toBe(target.attemptId);
		for (const value of [receipt, inspected, output, transcript, custom, record, prepared]) {
			const text = JSON.stringify(value);
			expect(text).not.toContain("TRELLIS_AUTH_TOKEN");
			expect(text).not.toContain(FIXTURE_BEARER);
			expect(text).not.toContain(process.env.PATH!);
		}
	});
}
