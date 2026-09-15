import { ORPCError } from "@orpc/client";

export const recoveryError = (error: Error | null) =>
	error instanceof ORPCError && error.code === "INPUT_VALIDATION_FAILED"
		? (error.data as { issues: { message: string }[] }).issues.map((issue) => issue.message).join("\n")
		: error?.message;
