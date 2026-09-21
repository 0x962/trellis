import { ORPCError } from "@orpc/client";
import { type GhReason, ghCopy } from "@trellis/api";

export const sendBackError = (error: Error | null): string | null => {
	if (error === null) return null;
	if (error instanceof ORPCError && error.code === "GH_UNAVAILABLE")
		return ghCopy[(error.data as { reason: GhReason }).reason].line;
	if (error instanceof ORPCError && error.code === "INPUT_VALIDATION_FAILED")
		return (error.data as { issues: { message: string }[] }).issues[0]!.message;
	return "The server did not confirm the review. Refresh the page before you try again.";
};
