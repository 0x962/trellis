import type { Status, Ticket } from "@trellis/api";
import type { ReactElement } from "react";

export type ReviewActionsProps = {
	ticket: Ticket;
	statuses: readonly Status[];
};

// Approve as the primary button and Send back beside it, shown only on a
// human reviewer status. Send back opens a sheet with the field "Comment"
// and the buttons Cancel and Confirm.
export function ReviewActions(_props: ReviewActionsProps): ReactElement | null {
	throw new Error("ReviewActions is not implemented");
}
