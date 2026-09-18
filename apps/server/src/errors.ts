import { ORPCError } from "@orpc/server";
import { type ErrorCode, errors } from "@trellis/api";
import type { z } from "zod";

type ErrorData<C extends ErrorCode> = z.infer<(typeof errors)[C]["data"]>;

// Builds the declared error for `code`, with the status of the contract. The
// caller throws the result. `message` states one failure in place of the
// default text of the contract, for a failure that carries a sentence of its
// own, such as the exit line of a tool. Every client narrows on `code` and
// reads `data`, so the payload shape is the one the contract declares for
// that code.
export const fail = <C extends ErrorCode>(code: C, data?: ErrorData<C>, message: string = errors[code].message) =>
	new ORPCError(code, { status: errors[code].status, message, data, defined: true });

// One Standard Schema issue on `path`, for INPUT_VALIDATION_FAILED raised
// by a rule the zod schema cannot state alone. The error message is the
// rule itself, so a toast or a CLI line states what
// happened without a read of `data.issues`.
export const invalidInput = (path: string, message: string) =>
	new ORPCError("INPUT_VALIDATION_FAILED", {
		status: errors.INPUT_VALIDATION_FAILED.status,
		message,
		data: { issues: [{ message, path: [path] }] },
		defined: true,
	});

// One issue of INPUT_VALIDATION_FAILED. `path` locates the field the issue
// is about, from the root of the input, for example ["nodes", 2, "minutes"].
export type InputIssue = { message: string; path?: (string | number)[] };

// The issues as one line of sentences. An issue that names a field starts
// with that field, for example "title: Expected a title.".
const issueLine = (issues: InputIssue[]) =>
	issues
		.map((issue) => {
			const path = issue.path ?? [];
			return path.length === 0 ? issue.message : `${path.join(".")}: ${issue.message}`;
		})
		.join(" ");

// INPUT_VALIDATION_FAILED for the issues a zod schema reports. The message
// holds every issue sentence, because the web and the mobile app show
// `message` and never read `data.issues`.
export const invalidIssues = (issues: InputIssue[]) =>
	new ORPCError("INPUT_VALIDATION_FAILED", {
		status: errors.INPUT_VALIDATION_FAILED.status,
		message: issueLine(issues),
		data: { issues },
		defined: true,
	});
