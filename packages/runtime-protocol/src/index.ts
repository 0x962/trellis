export const RUNTIME_PROTOCOL_VERSION = 5;
export type SessionMode = "pty" | "stdio";
export type SessionStatus = "running" | "exited" | "unknown";
export interface LaunchSpec {
	id: string;
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
	mode: SessionMode;
	separateStderr?: boolean;
	timeoutMs?: number;
	cols?: number;
	rows?: number;
}
export interface RuntimeSession {
	id: string;
	daemonId: string;
	pid: number | null;
	mode: SessionMode;
	status: SessionStatus;
	startedAt: string;
	endedAt: string | null;
	exitCode: number | null;
	error: string | null;
}
export interface RuntimeProcessMetadata {
	pid: number;
	parentPid: number;
	groupId: number;
	identity: string;
	startedAt: string;
	executable: string;
}
export interface RuntimeProcessStatus extends RuntimeSession {
	result: { id: string; text: string } | null;
	acknowledgedMessageIds: string[];
	activity: { state: "ready" | "working" | "idle"; updatedAt: string } | null;
	checkedAt: string;
	controllable: boolean;
	process: RuntimeProcessMetadata | null;
	launch: Pick<LaunchSpec, "command" | "args" | "cwd"> | null;
}
export interface RuntimeHello {
	version: typeof RUNTIME_PROTOCOL_VERSION;
	daemonId: string;
	pid: number;
	startedAt: string;
	socketPath: string;
	capabilities?: string[];
}
export interface RuntimeOutput {
	data: string;
	startOffset: number;
	nextOffset: number;
	truncated: boolean;
}
export type RuntimeOutputEvent =
	| ({ type: "output" } & RuntimeOutput)
	| { type: "session"; session: RuntimeProcessStatus };

export interface RuntimeDelivery {
	messageId: string;
	status: "written" | "unknown";
}
export interface RuntimeMethods {
	turn: {
		params: {
			id: string;
			token: string;
			event: "SessionStart" | "UserPromptSubmit" | "Stop";
			messageId?: string;
			result?: string;
		};
		result: RuntimeProcessStatus;
	};
	inspect: { params: { id: string }; result: RuntimeProcessStatus };
	subscribe: {
		params: { id: string; offset: number; stream?: "stdout" | "stderr"; output?: boolean };
		result: RuntimeOutputEvent;
	};
	shutdown: { params: Record<string, never>; result: null };
	deliver: { params: { id: string; messageId: string; data: string; requireIdle?: boolean }; result: RuntimeDelivery };
	hello: { params: Record<string, never>; result: RuntimeHello };
	list: { params: Record<string, never>; result: RuntimeProcessStatus[] };
	start: { params: LaunchSpec; result: RuntimeSession };
	input: { params: { id: string; data: string }; result: null };
	resize: { params: { id: string; cols: number; rows: number }; result: null };
	stop: { params: { id: string }; result: RuntimeSession };
	output: { params: { id: string; offset: number; stream?: "stdout" | "stderr" }; result: RuntimeOutput };
}
export type RuntimeMethod = keyof RuntimeMethods;
export interface RuntimeRequest {
	id: string;
	version: number;
	method: RuntimeMethod;
	params: RuntimeMethods[RuntimeMethod]["params"];
}
export type RuntimeResponse =
	| { id: string; result: unknown }
	| { id: string; error: { code: string; message: string } };
