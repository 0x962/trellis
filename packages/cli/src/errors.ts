import type { ORPCError } from "@orpc/client";
import type { ErrorCode, GhReason } from "@trellis/api";

// The process exit code for every error the contract declares. A code the
// contract adds without a row here fails errors.test.ts.
const exitCodes: Record<ErrorCode, number> = {
	INPUT_VALIDATION_FAILED: 4,
	ACTOR_REQUIRED: 4,
	ACTOR_INVALID: 4,
	INVALID_CURSOR: 4,
	INVALID_PR_URL: 4,
	AGENT_CANNOT_DELETE: 4,
	NOT_FOUND: 3,
	DUPLICATE: 4,
	COMMENT_HAS_REPLIES: 4,
	CHAT_AI_ONLY: 4,
	CHAT_DIRECT: 4,
	COMMENT_PARENT_MISMATCH: 4,
	KEY_LOCKED: 4,
	STATUS_NOT_IN_PROJECT: 4,
	STATUS_IN_USE: 4,
	LAST_STATUS: 4,
	ROOT_STATUSES: 4,
	STATUS_CATEGORY_IMMUTABLE: 4,
	CROSS_ROOT_MOVE: 4,
	PARENT_CYCLE: 4,
	PROJECT_NOT_EMPTY: 4,
	PROJECT_ARCHIVED: 4,
	INVALID_ANCHOR: 4,
	REVIEW_VERSION_CONFLICT: 4,
	VERSION_CONFLICT: 4,
	FLOW_VERSION_CONFLICT: 4,
	PAYLOAD_TOO_LARGE: 4,
	GH_UNAVAILABLE: 6,
	CONCURRENCY_LIMIT: 4,
	RUNNER_UNAVAILABLE: 6,
	RESTART_FAILED: 6,
};

// An error the contract does not declare comes from a crashed handler, so it
// exits as a server error.
export const exitCodeFor = (code: string): number => (code in exitCodes ? exitCodes[code as ErrorCode] : 1);

// A failure the CLI raises itself, before or around a request. `code` is the
// label in the stderr line and `exitCode` is what the process returns.
export class CliFailure extends Error {
	constructor(
		readonly code: string,
		readonly exitCode: number,
		message: string,
	) {
		super(message);
		this.name = "CliFailure";
	}
}

export const usageError = (message: string) => new CliFailure("USAGE", 2, message);

// A ref the CLI resolves itself, against a list the server answered, and
// that names no row. The line matches the server's NOT_FOUND line.
export const notFound = (kind: string, ref: string) => new CliFailure("NOT_FOUND", 3, `No ${kind} matches ${ref}.`);

// A path the command line names and the process cannot open. The person
// reads one line and fixes the path; a stack trace tells them nothing.
export const fileNotFound = (path: string) => new CliFailure("NOT_FOUND", 3, `No file at ${path}.`);

export const fileUnreadable = (path: string, reason: string) =>
	new CliFailure("USAGE", 2, `cannot read ${path}: ${reason}`);

export const unreachable = (url: string) =>
	new CliFailure("UNREACHABLE", 5, `trellis server not running at ${url}; run "trellis install" or "bun dev"`);

export const serverOlder = (serverVersion: string, cliVersion: string) =>
	new CliFailure(
		"SERVER_OLDER",
		7,
		`the server api ${serverVersion} is older than the CLI api ${cliVersion}; restart the server from the new build`,
	);

// stderr carries one line per error, so every line break in a message
// becomes one space.
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

type Data = Record<string, unknown>;

// The extra words a code's payload adds to the server message.
const detail = (code: string, message: string, data: Data): string => {
	switch (code) {
		case "NOT_FOUND":
			return `No ${data.kind} matches ${data.ref}.`;
		case "STATUS_NOT_IN_PROJECT": {
			const names = (data.valid as Array<{ name: string }>).map((status) => status.name).join(", ");
			return `${message} Valid statuses: ${names}.`;
		}
		case "VERSION_CONFLICT":
			return `${message} The current version is ${(data.current as { version: number }).version}.`;
		case "STATUS_IN_USE":
			return `${message} ${data.count} tickets use it.`;
		case "PROJECT_NOT_EMPTY":
			return `${message} It holds ${data.tickets} tickets and ${data.projects} sub-projects.`;
		case "DUPLICATE":
			return `${message} Field: ${data.field}.`;
		case "PAYLOAD_TOO_LARGE":
			return `${message} The limit is ${data.maxBytes} bytes.`;
		case "GH_UNAVAILABLE":
		case "RUNNER_UNAVAILABLE":
			return `${message} Reason: ${data.reason}.`;
		case "CONCURRENCY_LIMIT":
			return `${message} ${data.running} of ${data.limit} builders are running.`;
		case "INPUT_VALIDATION_FAILED": {
			const issues = data.issues as Array<{ path?: Array<string | number>; message: string }>;
			return `${message} ${issues.map((issue) => `${(issue.path ?? []).join(".")}: ${issue.message}`).join("; ")}`;
		}
		default:
			return message;
	}
};

export const formatError = (error: ORPCError<string, unknown>): string => {
	const data = (error.data ?? {}) as Data;
	return `error: ${oneLine(detail(error.code, error.message, data))} (${error.code})`;
};

export const formatFailure = (failure: CliFailure): string => `error: ${oneLine(failure.message)} (${failure.code})`;

// The line the web shows for a gh outage, so a person knows what to run.
export const ghBanner = (gh: { reason: GhReason | null; message: string | null }): string => {
	if (gh.reason === "unauthenticated") return "GitHub CLI not authenticated: run gh auth login in a terminal";
	if (gh.reason === "missing") return "gh not found: brew install gh";
	return `gh error: ${gh.message ?? "unknown"}`;
};
