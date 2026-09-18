import { ORPCError } from "@orpc/client";
import { errorMessage } from "../../../lib/conflict";

// The text a label form shows when a write fails. The root project holds one
// name set for its groups and for the labels with no group, so one message
// covers both. LABEL_GROUP_CONFLICT arrives when a label moves into a group:
// `count` tickets already hold that label and another label of the group, and
// a ticket takes one label of a group at most.
export const labelWriteMessage = (error: unknown): string => {
	if (error instanceof ORPCError) {
		if (error.code === "DUPLICATE") return "A label or a group with this name exists.";
		if (error.code === "LABEL_GROUP_CONFLICT") {
			const { count } = error.data as { count: number };
			const subject = count === 1 ? "1 ticket holds" : `${count} tickets hold`;
			return `${subject} another label of this group. Remove one of the two labels from those tickets first.`;
		}
	}
	return errorMessage(error);
};
