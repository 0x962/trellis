import type {
	LaunchSpec,
	RuntimeDelivery,
	RuntimeExpectedTurn,
	RuntimeHello,
	RuntimeListInput,
	RuntimeMessageState,
	RuntimeOutput,
	RuntimeOutputEvent,
	RuntimeProcessStatus,
	RuntimeSession,
	RuntimeSessionList,
	RuntimeStream,
} from "../../index.ts";
import type { terminalChannel } from "../../terminalChannel";
import type { ExecutionTarget } from "../ExecutionTarget";
import type { HostBinding } from "../HostBinding";
import type { LaunchOutcome } from "../LaunchOutcome";
import type { PreparedLaunch } from "../PreparedLaunch";

// The types one host uses to prepare a launch. `input` is what a caller
// hands to `prepare.descriptor`, `descriptor` is the record the host writes
// and reads back, and `workspace` is the run record that `prepare.workspace`
// takes. A host that prepares nothing keeps the defaults.
export type ExecutionPrepare = {
	input: unknown;
	descriptor: PreparedLaunch;
	workspace?: unknown;
};

// A launch of one shell command inside the attempt environment. `token` is
// the attempt token; the host derives the rest of the attempt environment
// from the target.
export type CustomLaunchInput = {
	command: string;
	cwd: string;
	token: string;
	timeoutMs?: number;
};

// Every way the Trellis server reaches the process of an attempt, grouped by
// operation. One instance serves one `binding`. Every method that takes a
// target refuses a target whose host or controller differs from the binding
// with a TargetMismatch, before any socket or file system work. A method
// that returns a promise rejects with it, and a method that returns a
// generator, a channel or a path throws it. The methods that take no target
// act on the whole host.
//
// Input bytes cross this interface as bytes. `transcript.output` returns the
// runtime answer verbatim, with base64 `data` and byte offsets, so a caller
// keeps offsets byte-exact across hosts.
export interface ExecutionHost<Prepare extends ExecutionPrepare = ExecutionPrepare> {
	readonly binding: HostBinding;
	health: {
		hello(signal?: AbortSignal): Promise<RuntimeHello>;
	};
	prepare: {
		workspace(
			target: ExecutionTarget,
			input: { run: Prepare["workspace"]; directory: string },
		): Promise<{ workspaceId: string }>;
		descriptor(target: ExecutionTarget, input: Prepare["input"]): Promise<Prepare["descriptor"]>;
		custom(target: ExecutionTarget, input: CustomLaunchInput): Promise<LaunchSpec>;
	};
	launch: {
		// `spec.id` must equal `target.attemptId`.
		start(target: ExecutionTarget, spec: LaunchSpec): Promise<LaunchOutcome>;
		// Starts the prepared launch record of the attempt. A record that the
		// runtime already holds is not started a second time.
		startPrepared(target: ExecutionTarget, timeoutMs?: number): Promise<LaunchOutcome>;
	};
	observe: {
		inspect(target: ExecutionTarget): Promise<RuntimeProcessStatus>;
		recover(target: ExecutionTarget): Promise<RuntimeProcessStatus>;
		list(input?: RuntimeListInput, signal?: AbortSignal): Promise<RuntimeSessionList>;
		session(target: ExecutionTarget, signal?: AbortSignal): AsyncGenerator<RuntimeOutputEvent>;
		waitFor(
			target: ExecutionTarget,
			matches: (session: RuntimeProcessStatus) => boolean,
			options?: { rejectAgentError?: boolean; limitMs?: number; signal?: AbortSignal },
		): Promise<RuntimeProcessStatus>;
	};
	input: {
		raw(target: ExecutionTarget, data: Uint8Array, userInput?: boolean, expected?: RuntimeExpectedTurn): Promise<null>;
		deliver(
			target: ExecutionTarget,
			messageId: string,
			data: Uint8Array,
			expected?: RuntimeExpectedTurn,
		): Promise<RuntimeDelivery>;
		queue(target: ExecutionTarget, messageId: string, data: Uint8Array): Promise<RuntimeDelivery>;
		receipt(target: ExecutionTarget, messageId: string): Promise<RuntimeMessageState>;
		awaitReceipt(target: ExecutionTarget, messageId: string, timeoutMs: number): Promise<RuntimeProcessStatus>;
		resize(target: ExecutionTarget, cols: number, rows: number): Promise<null>;
	};
	stop: {
		stop(target: ExecutionTarget): Promise<RuntimeSession>;
		shutdown(): Promise<null>;
	};
	files: {
		descriptor(target: ExecutionTarget): Promise<Prepare["descriptor"]>;
		capturePath(target: ExecutionTarget): string;
		captureExists(target: ExecutionTarget): Promise<boolean>;
		writeCapture(target: ExecutionTarget, text: string): Promise<void>;
		workspacePath(target: ExecutionTarget): string;
	};
	transcript: {
		output(target: ExecutionTarget, offset: number, stream?: RuntimeStream): Promise<RuntimeOutput>;
		// The whole retained stream of the attempt, decoded as UTF-8.
		readAll(target: ExecutionTarget, stream?: RuntimeStream): Promise<string>;
		subscribe(
			target: ExecutionTarget,
			offset: number,
			stream?: RuntimeStream,
			signal?: AbortSignal,
		): AsyncGenerator<RuntimeOutputEvent>;
	};
	terminal: {
		channel(target: ExecutionTarget, offset: number, signal?: AbortSignal): ReturnType<typeof terminalChannel>;
		// True when the runtime serves the binary terminal channel.
		binaryChannel(): Promise<boolean>;
	};
}
