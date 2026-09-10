import { ORPCError } from "@orpc/server";
import { type ErrorCode, errors } from "@trellis/api";
import type { z } from "zod";

export type ErrorData<C extends ErrorCode> = z.infer<(typeof errors)[C]["data"]>;

// The error a service throws. The status and the default message come from
// the one error map the clients read, so a thrown code always matches the
// contract the procedure declares.
export const contractError = <C extends ErrorCode>(code: C, data: ErrorData<C>) =>
	new ORPCError(code, { status: errors[code].status, message: errors[code].message, data, defined: true });
