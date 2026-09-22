import type { ORPCError } from "@orpc/client";
import { errors as apiErrors, type ErrorCode, type GhReason, ghCopy } from "@trellis/api";

// The process exit code for every error the contract declares. The Record
// type requires one row for each ErrorCode value.
const exitCodes: Record<ErrorCode, number> = {
	INPUT_VALIDATION_FAILED: 4,
	ACTOR_REQUIRED: 4,
	ACTOR_INVALID: 4,
	INVALID_CURSOR: 4,
	INVALID_PR_URL: 4,
	AGENT_CANNOT_DELETE: 4,
	NOT_FOUND: 3,
	DUPLICATE: 4,
	KEY_LOCKED: 4,
	STATUS_NOT_IN_PROJECT: 4,
	STATUS_IN_USE: 4,
	LAST_STATUS: 4,
	ROOT_STATUSES: 4,
	STATUS_CATEGORY_IMMUTABLE: 4,
	LABEL_AMBIGUOUS: 4,
	LABEL_GROUP_CONFLICT: 4,
	CROSS_ROOT_MOVE: 4,
	WAVE_OUTSIDE_EPIC: 4,
	PARENT_CYCLE: 4,
	DEPENDENCY_CYCLE: 4,
	PROJECT_NOT_EMPTY: 4,
	PROJECT_ARCHIVED: 4,
	INVALID_ANCHOR: 4,
	REVIEW_VERSION_CONFLICT: 4,
	REVIEW_SUGGESTION_STALE: 4,
	PR_HEAD_MOVED: 4,
	VERSION_CONFLICT: 4,
	FLOW_VERSION_CONFLICT: 4,
	SESSION_ATTENTION_CHANGED: 4,
	PAYLOAD_TOO_LARGE: 4,
	GH_UNAVAILABLE: 6,
	RUNNER_UNAVAILABLE: 6,
	RESTART_FAILED: 6,
	BACKUP_FAILED: 1,
	SEARCH_REPLACED: 4,
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

// The LABEL_AMBIGUOUS line: the server sentence, then every `group/name` ref
// that the bare name matches.
const ambiguousLine = (message: string, matches: string[]) => `${message} Matches: ${matches.join(", ")}.`;

// A bare label name the CLI resolves itself, against the `labels.list`
// answer, and that names a label in more than one group. The line matches
// the server's LABEL_AMBIGUOUS line.
export const labelAmbiguous = (matches: string[]) =>
	new CliFailure("LABEL_AMBIGUOUS", 4, ambiguousLine(apiErrors.LABEL_AMBIGUOUS.message, matches));

// A path the command line names and the process cannot open. The person
// reads one line and fixes the path; a stack trace tells them nothing.
export const fileNotFound = (path: string) => new CliFailure("NOT_FOUND", 3, `No file at ${path}.`);

export const fileUnreadable = (path: string, reason: string) =>
	new CliFailure("USAGE", 2, `cannot read ${path}: ${reason}`);

// EVIDENCE_FLOOR_MISSING comes from this CLI, so exitCodes has no row.
// Its exit code 1 reports a refused operation, not invalid input.
export const evidenceFloorMissing = (ticket: string) =>
	new CliFailure(
		"EVIDENCE_FLOOR_MISSING",
		1,
		`An agent cannot move ${ticket} to human-review while required evidence is missing.`,
	);

export const pullRequestNotReady = (number: number) =>
	new CliFailure(
		"PR_NOT_READY",
		1,
		`trellis pr add requires the summary and every evidence floor item of #${number}. Run the command beside each MISSING line, then run: trellis ready ${number}`,
	);

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
		case "NOT_FOUND": {
			if (typeof data.kind !== "string" || typeof data.ref !== "string") return message;
			return `No ${data.kind} matches ${data.ref}.`;
		}
		case "STATUS_NOT_IN_PROJECT": {
			const names = (data.valid as Array<{ name: string }>).map((status) => status.name).join(", ");
			return `${message} Valid statuses: ${names}.`;
		}
		case "VERSION_CONFLICT":
			return `${message} The current version is ${(data.current as { version: number }).version}.`;
		case "STATUS_IN_USE":
			return `${message} ${data.count} tickets use it.`;
		case "LABEL_AMBIGUOUS":
			return ambiguousLine(message, data.matches as string[]);
		case "LABEL_GROUP_CONFLICT":
			return `${message} ${data.count} tickets hold both labels.`;
		case "PROJECT_NOT_EMPTY":
			return `${message} It holds ${data.tickets} tickets and ${data.projects} sub-projects.`;
		case "DUPLICATE":
			return `${message} Field: ${data.field}.`;
		case "PAYLOAD_TOO_LARGE":
			return `${message} The limit is ${data.maxBytes} bytes.`;
		case "GH_UNAVAILABLE":
		case "RUNNER_UNAVAILABLE":
			return `${message} Reason: ${data.reason}.`;
		case "INPUT_VALIDATION_FAILED": {
			const issues = data.issues as Array<{ path?: Array<string | number>; message: string }>;
			// The server writes the same sentences into the top-level message.
			// An issue whose text the message already holds would print twice,
			// so only an issue that adds words reaches the line.
			const extra = issues
				.filter((issue) => !message.includes(issue.message))
				.map((issue) => {
					const path = issue.path ?? [];
					return path.length === 0 ? issue.message : `${path.join(".")}: ${issue.message}`;
				});
			return extra.length === 0 ? message : `${message} ${extra.join("; ")}`;
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

// The line the web shows for a gh outage, so a person knows what to run. A
// reason with no command in `ghCopy` carries the server's own message
// instead.
export const ghBanner = (gh: { reason: GhReason | null; message: string | null }): string => {
	const { line, command } = ghCopy[gh.reason ?? "error"];
	return command === null ? `${line} ${gh.message ?? "unknown"}` : `${line} Run ${command}.`;
};
