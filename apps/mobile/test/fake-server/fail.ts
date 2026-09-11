import { ORPCError } from "@orpc/server";
import { type ErrorCode, errors } from "@trellis/api";
import type { z } from "zod";

// A declared error with its status and default message from the contract.
// The handler validates the data against the declared schema on the way
// out and marks the error defined, so a typed client narrows on `code`.
export const fail = <C extends ErrorCode>(code: C, data: z.input<(typeof errors)[C]["data"]>) =>
	new ORPCError(code, { status: errors[code].status, message: errors[code].message, data });
