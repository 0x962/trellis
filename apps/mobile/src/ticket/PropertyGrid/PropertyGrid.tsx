import type { Ticket } from "@trellis/api";
import type { ReactElement } from "react";

export type PropertyGridProps = {
	ticket: Ticket;
	// The title of the parent ticket, once its detail is loaded.
	parentTitle: string | undefined;
	onStatusPress: () => void;
	onPriorityPress: () => void;
};

// The four rows under the title. The Status row and the Priority row are
// 44 px buttons named by their label. The Project row shows the path, and
// the Parent row shows the identifier with the title.
export function PropertyGrid(_props: PropertyGridProps): ReactElement {
	throw new Error("PropertyGrid is not implemented");
}
