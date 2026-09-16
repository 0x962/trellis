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
// rule itself, so a toast, a CLI line, or a manager tool result states what
// happened without a read of `data.issues`.
export const invalidInput = (path: string, message: string) =>
	new ORPCError("INPUT_VALIDATION_FAILED", {
		status: errors.INPUT_VALIDATION_FAILED.status,
		message,
		data: { issues: [{ message, path: [path] }] },
		defined: true,
	});
