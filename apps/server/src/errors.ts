import { ORPCError } from "@orpc/server";
import { type ErrorCode, errors } from "@trellis/api";
import type { z } from "zod";

type ErrorData<C extends ErrorCode> = z.infer<(typeof errors)[C]["data"]>;

// Builds the declared error for `code`, with the status and the default
// message of the contract. The caller throws the result. Every client
// narrows on `code` and reads `data`, so the payload shape is the one the
// contract declares for that code.
export const fail = <C extends ErrorCode>(code: C, data?: ErrorData<C>) =>
	new ORPCError(code, { status: errors[code].status, message: errors[code].message, data, defined: true });

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
