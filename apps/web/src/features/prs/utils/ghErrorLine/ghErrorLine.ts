import { ORPCError } from "@orpc/client";
import type { GhReason } from "@trellis/api";
import { ghCopy } from "../../../../lib/ghCopy";

// What to show beside the field or the header when a call fails. A gh
// failure reads in the words of the shared gh copy module, so the pull
// request section and the settings page never word one failure in two ways.
// Every other error carries the server's own message.
export const ghErrorLine = (error: unknown): string => {
	if (error instanceof ORPCError && error.code === "GH_UNAVAILABLE") {
		return ghCopy[(error.data as { reason: GhReason }).reason].line;
	}
	return (error as Error).message;
};
