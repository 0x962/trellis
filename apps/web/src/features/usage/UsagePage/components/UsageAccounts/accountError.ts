import { ORPCError } from "@orpc/client";

export const accountError = (error: Error | null | undefined) =>
	error instanceof ORPCError && error.code === "INPUT_VALIDATION_FAILED"
		? (error.data as { issues: { message: string }[] }).issues.map((issue) => issue.message).join(" ")
		: error?.message;
