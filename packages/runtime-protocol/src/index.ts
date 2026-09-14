export const RUNTIME_PROTOCOL_VERSION = 1;
export type SessionMode = "pty" | "stdio";
export type SessionStatus = "running" | "exited" | "unknown";
export interface LaunchSpec {
	id: string;
	command: string;
	args: string[];
	cwd: string;
	env?: Record<string, string>;
	mode: SessionMode;
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
export interface RuntimeHello {
	version: typeof RUNTIME_PROTOCOL_VERSION;
	daemonId: string;
	pid: number;
	startedAt: string;
	socketPath: string;
}
export interface RuntimeOutput {
	data: string;
	startOffset: number;
	nextOffset: number;
	truncated: boolean;
}
export interface RuntimeMethods {
	hello: { params: Record<string, never>; result: RuntimeHello };
	list: { params: Record<string, never>; result: RuntimeSession[] };
	start: { params: LaunchSpec; result: RuntimeSession };
	input: { params: { id: string; data: string }; result: null };
	resize: { params: { id: string; cols: number; rows: number }; result: null };
	stop: { params: { id: string }; result: RuntimeSession };
	output: { params: { id: string; offset: number }; result: RuntimeOutput };
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
