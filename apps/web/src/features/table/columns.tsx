import { columnVisibilityFeature, createColumnHelper, tableFeatures } from "@tanstack/react-table";
import type { TicketSummary } from "@trellis/api";
import type { CSSProperties } from "react";

export type ColumnId =
	| "select"
	| "priority"
	| "id"
	| "title"
	| "labels"
	| "status"
	| "pr"
	| "project"
	| "waits"
	| "releases"
	| "actor"
	| "updated"
	| "created"
	| "parent"
	| "epic"
	| "milestone"
	| "subtickets";

// The columns in display order.
export const columnOrder: readonly ColumnId[] = [
	"select",
	"priority",
	"id",
	"title",
	"labels",
	"status",
	"pr",
	"project",
	"waits",
	"releases",
	"actor",
	"updated",
	"created",
	"parent",
	"epic",
	"milestone",
	"subtickets",
];

export const columnLabels: Record<ColumnId, string> = {
	select: "Select",
	priority: "Priority",
	id: "ID",
	title: "Title",
	labels: "Labels",
	status: "Status",
	pr: "PR",
	project: "Project",
	waits: "Waits on",
	releases: "Releases",
	actor: "Last actor",
	updated: "Updated",
	created: "Created",
	parent: "Parent",
	epic: "Epic",
	milestone: "Wave",
	subtickets: "Sub-tickets",
};

// The grid track of each column. The title takes what is left.
export const columnWidths: Record<ColumnId, string> = {
	select: "16px",
	priority: "16px",
	id: "72px",
	title: "minmax(0, 1fr)",
	// Two label pills and the gap between them. The track never changes with
	// the data, so a row that gains a label keeps its title width.
	labels: "180px",
	status: "140px",
	pr: "72px",
	project: "120px",
	// The design of the epic page sets this width. It holds two identifiers
	// of 6 characters and the separator between them, at 11 px mono. A third
	// identifier comes out and the cell prints `+1` in its place.
	waits: "110px",
	releases: "40px",
	actor: "20px",
	updated: "48px",
	created: "48px",
	parent: "72px",
	epic: "120px",
	milestone: "120px",
	subtickets: "48px",
};

// The select column and the title are the row; they never hide.
export const alwaysVisible: readonly ColumnId[] = ["select", "title"];

// The columns a route hides until the Display popover shows them.
export const hiddenByDefault: readonly ColumnId[] = ["created", "parent", "epic", "milestone", "subtickets"];

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

// The columns a screen under 768 px hides, so the title keeps room to read.
export const narrowHidden: readonly ColumnId[] = ["labels", "pr", "project", "actor"];

// The kind of table a route draws. An epic is a plan, so only its table
// shows which ticket waits for which.
export type TableKind = "epic" | "list";

// The kind of table that owns a column. A table of another kind hides that
// column, and its Display popover does not offer it. A column this map
// does not hold shows on every kind.
export const columnOwner: Partial<Record<ColumnId, TableKind>> = { waits: "epic", releases: "epic" };

// True when the row prints the status icon without the status name. Only
// an epic table shows the `waits` and the `releases` columns, and on that
// table the `waits` cell and the pull request lines already show the state
// of the work.
export const statusIconOnly = (ids: readonly string[]) => ids.some((id) => columnOwner[id as ColumnId] === "epic");

// The status cell drops its name on a screen under 768 px, and on a row
// where `statusIconOnly` is true. The status column is then 28 px, the
// width of the icon button.
const iconWidths: Partial<Record<ColumnId, string>> = { status: "28px" };

// `gridTemplate` hands this record to every row of an epic table, so it is
// built once here.
const iconColumnWidths: Record<ColumnId, string> = { ...columnWidths, ...iconWidths };

// The `grid-template-columns` of a row and of the header.
const gridTemplate = (ids: readonly string[]) => {
	const widths = statusIconOnly(ids) ? iconColumnWidths : columnWidths;
	return ids.map((id) => widths[id as ColumnId]).join(" ");
};

// The tracks of a row and of the header as two custom properties, one for
// 768 px and up and one for a narrower screen. `gridColumnsClass` picks one
// with a media query. A cell in `narrowHidden` is `display: none` under
// 768 px, so the narrow set has no track for it.
export const gridStyle = (ids: readonly string[]) =>
	({
		"--grid-wide": gridTemplate(ids),
		"--grid-narrow": ids
			.filter((id) => !narrowHidden.includes(id as ColumnId))
			.map((id) => iconWidths[id as ColumnId] ?? columnWidths[id as ColumnId])
			.join(" "),
	}) as CSSProperties;

export const gridColumnsClass = "grid-cols-(--grid-wide) max-md:grid-cols-(--grid-narrow)";
