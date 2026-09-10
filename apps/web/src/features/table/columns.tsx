import { columnVisibilityFeature, createColumnHelper, tableFeatures } from "@tanstack/react-table";
import type { TicketSummary } from "@trellis/api";
import type { CSSProperties } from "react";

export type ColumnId =
	| "select"
	| "priority"
	| "id"
	| "title"
	| "status"
	| "pr"
	| "project"
	| "actor"
	| "updated"
	| "created"
	| "parent"
	| "subtickets";

// The columns in display order.
export const columnOrder: readonly ColumnId[] = [
	"select",
	"priority",
	"id",
	"title",
	"status",
	"pr",
	"project",
	"actor",
	"updated",
	"created",
	"parent",
	"subtickets",
];

export const columnLabels: Record<ColumnId, string> = {
	select: "Select",
	priority: "Priority",
	id: "ID",
	title: "Title",
	status: "Status",
	pr: "PR",
	project: "Project",
	actor: "Last actor",
	updated: "Updated",
	created: "Created",
	parent: "Parent",
	subtickets: "Sub-tickets",
};

// The grid track of each column. The title takes what is left.
export const columnWidths: Record<ColumnId, string> = {
	select: "16px",
	priority: "16px",
	id: "72px",
	title: "minmax(0, 1fr)",
	status: "140px",
	pr: "72px",
	project: "120px",
	actor: "20px",
	updated: "48px",
	created: "48px",
	parent: "72px",
	subtickets: "48px",
};

// The select column and the title are the row; they never hide.
export const alwaysVisible: readonly ColumnId[] = ["select", "title"];

// The columns a route hides until the Display popover shows them.
export const hiddenByDefault: readonly ColumnId[] = ["created", "parent", "subtickets"];

export const tableFeatureSet = tableFeatures({ columnVisibilityFeature });

const helper = createColumnHelper<typeof tableFeatureSet, TicketSummary>();

// One display column per id. The cells render in Row from the ticket, so
// the definitions carry the identity, the heading, and the hiding rule.
export const buildColumns = () =>
	helper.columns(
		columnOrder.map((id) =>
			helper.display({ id, header: columnLabels[id], enableHiding: !alwaysVisible.includes(id) }),
		),
	);

// The `grid-template-columns` of a row and of the header.
export const gridTemplate = (ids: readonly string[]) => ids.map((id) => columnWidths[id as ColumnId]).join(" ");

// The columns a screen under 768 px hides, so the title keeps room to read.
export const narrowHidden: readonly ColumnId[] = ["pr", "project", "actor"];

// Under 768 px the status cell shows its icon alone, in its 28 px button.
const narrowWidths: Partial<Record<ColumnId, string>> = { status: "28px" };

// The tracks of a row and of the header as two custom properties, one for
// 768 px and up and one for a narrower screen. `gridColumnsClass` picks one
// with a media query. A cell in `narrowHidden` is `display: none` under
// 768 px, so the narrow set has no track for it.
export const gridStyle = (ids: readonly string[]) =>
	({
		"--grid-wide": gridTemplate(ids),
		"--grid-narrow": ids
			.filter((id) => !narrowHidden.includes(id as ColumnId))
			.map((id) => narrowWidths[id as ColumnId] ?? columnWidths[id as ColumnId])
			.join(" "),
	}) as CSSProperties;

export const gridColumnsClass = "grid-cols-(--grid-wide) max-md:grid-cols-(--grid-narrow)";
