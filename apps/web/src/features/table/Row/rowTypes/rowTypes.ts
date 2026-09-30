import type { EpicSummary, Label, Priority, StatusSummary, TicketSummary, WaveSummary } from "@trellis/api";
import type { MouseEvent } from "react";
import type { Density } from "../../../../stores/uiStore";
import type { TableKind } from "../../columns";
import type { TicketAgentLine } from "../../utils/agentLines";
import type { TicketDisclosure as TicketDisclosureState } from "../../utils/flattenGroups";

// The inline editors a row opens.
export type EditField = "status" | "priority" | "parent" | "labels" | "epic" | "wave";

// One change a row's picker or the bulk bar applies. `checked` on a label
// change is the new state of that label on the ticket.
export type RowChange =
	| { status: StatusSummary }
	| { priority: Priority }
	| { parent: TicketSummary | null }
	| { epic: EpicSummary | null }
	| { wave: WaveSummary | null }
	| { label: Label; checked: boolean };

export type RowProps = {
	ticket: TicketSummary;
	density: Density;
	// The visible column ids, in order.
	columns: string[];
	// The project ref of the route, or undefined on /all.
	viewedProject?: string;
	// The offset inside the virtual body.
	top?: number;
	// The group key, for the rows of a group.
	group?: string;
	// Below 768 px the row is a `PhoneRow` of two lines.
	phone?: boolean;
	// The layout of the `PhoneRow`.
	phoneLayout?: TableKind;
	// The line of the ticket's run, for the phone row.
	agentLine?: TicketAgentLine | null;
	disclosure?: TicketDisclosureState;
	// True when child lines follow the row. The row then starts the tree
	// rule under its status icon and draws no bottom border, so the ticket
	// and its child lines read as one group.
	hasChildLines?: boolean;
	focused?: boolean;
	// True while the row plays the green wash of a ticket that was marked
	// done a moment ago.
	washing?: boolean;
	selected?: boolean;
	// True while any row is selected.
	selecting?: boolean;
	// The picker that is open on this row.
	editing?: EditField | null;
	statuses?: readonly StatusSummary[];
	onFocus?: (id: string) => void;
	onClick?: (id: string, event: MouseEvent) => void;
	onToggleDisclosure?: (id: string) => void;
	// A double click on the title. The title never edits inline.
	onOpen?: (id: string) => void;
	onToggleSelect?: (id: string) => void;
	onEditingChange?: (id: string, field: EditField | null) => void;
	onChange?: (ticket: TicketSummary, change: RowChange) => void;
};
