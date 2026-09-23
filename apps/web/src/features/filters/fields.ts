import type { CiState, EpicSummary, PrFilter, Priority, StatusSummary, WaveSummary } from "@trellis/api";
import { priorityLabels } from "../pickers/PriorityPicker";
import { categoryLabels } from "../pickers/statusGroups";
import type { NegatableField, View } from "./grammar";
import { type FilterLabel, filterLabelName, noLabelValue } from "./labelValues";

// The fields a chip stands for. `ci` is set through the PR field.
export type FilterField =
	| "status"
	| "category"
	| "priority"
	| "label"
	| "project"
	| "parent"
	| "waitsOn"
	| "blocked"
	| "epic"
	| "wave"
	| "pr"
	| "ci"
	| "updated"
	| "created"
	| "actor";

// The fields the picker offers, in its order.
export const pickerFields: readonly FilterField[] = [
	"status",
	"priority",
	"label",
	"project",
	"parent",
	"waitsOn",
	"blocked",
	"epic",
	"wave",
	"pr",
	"updated",
	"created",
	"actor",
];

// Every field that can hold a chip, in chip order.
export const chipFields: readonly FilterField[] = [
	"status",
	"category",
	"priority",
	"label",
	"project",
	"parent",
	"waitsOn",
	"blocked",
	"epic",
	"wave",
	"pr",
	"ci",
	"updated",
	"created",
	"actor",
];

export const fieldLabels: Record<FilterField, string> = {
	status: "Status",
	category: "Status",
	priority: "Priority",
	label: "Label",
	project: "Project",
	parent: "Parent",
	waitsOn: "Waits on",
	blocked: "Blocked",
	epic: "Epic",
	wave: "Wave",
	pr: "PR",
	ci: "PR",
	updated: "Updated",
	created: "Created",
	actor: "Actor",
};

// A multi-value field keeps its picker open: each pick toggles one value.
export const multiValue: readonly FilterField[] = ["status", "priority", "label", "ci"];

export const negatable: readonly NegatableField[] = ["status", "priority", "project", "label"];

export const prLabels: Record<PrFilter, string> = {
	any: "any",
	none: "none",
	open: "open",
	"not-ready": "not ready",
	queued: "queued",
	merged: "merged",
	closed: "closed",
};

export const ciLabels: Record<CiState, string> = {
	pass: "passed",
	fail: "failed",
	pending: "pending",
	none: "without checks",
};

export const timeLabels: Record<string, string> = {
	"1h": "the last hour",
	"24h": "the last 24 hours",
	"7d": "the last 7 days",
	"30d": "the last 30 days",
};

export const actorLabels: Record<string, string> = { "@agent": "agents", "@human": "humans" };

// The word between the field and its values.
export const opLabel = (field: FilterField, negated: boolean) => {
	if (field === "updated" || field === "created") return "in";
	return negated ? "is not" : "is";
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

// The name of one value, as the chip prints it. `labels` holds the labels of
// the project tree the route shows, in the same way `statuses` holds its
// statuses. `epics` holds the epics of the viewed project; an epic value the
// list does not hold prints its ref. `waves` holds the waves of the
// epic that the wave value names; a value the list does not hold prints
// its ref.
export const valueLabel = (
	field: FilterField,
	value: string,
	statuses: readonly StatusSummary[],
	labels: readonly FilterLabel[] = [],
	epics: readonly EpicSummary[] = [],
	waves: readonly WaveSummary[] = [],
): string => {
	switch (field) {
		case "status": {
			const status = statuses.find((entry) => entry.slug === value || entry.id === value);
			return status?.name ?? value;
		}
		case "category":
			return categoryLabels[value as keyof typeof categoryLabels] ?? value;
		case "priority":
			return priorityLabels[value as Priority] ?? capitalize(value);
		case "label": {
			if (value === noLabelValue) return "No label";
			const label = labels.find((entry) => entry.ref === value);
			return label === undefined ? value : filterLabelName(label);
		}
		case "pr":
			return prLabels[value as PrFilter] ?? value;
		case "ci":
			return ciLabels[value as CiState] ?? value;
		case "updated":
		case "created":
			return timeLabels[value] ?? value;
		case "actor":
			return actorLabels[value] ?? value;
		case "parent":
			return value === "none" ? "none" : value;
		case "waitsOn":
			return value;
		case "blocked":
			return value === "true" ? "yes" : "no";
		case "epic": {
			if (value === "none") return "No epic";
			const epic = epics.find((entry) => entry.ref === value || entry.id === value);
			return epic?.name ?? value;
		}
		case "wave": {
			if (value === "none") return "No wave";
			const wave = waves.find((entry) => entry.ref === value || entry.id === value);
			return wave?.name ?? value;
		}
		case "project":
			return value.split(".").join("/");
	}
};

// The values a field holds in the view, as strings.
export const valuesOf = (view: View, field: FilterField): string[] => {
	const value = view[field];
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [String(value)];
};

// The view without a field.
export const withoutField = (view: View, field: FilterField): View => {
	const { [field]: _dropped, ...rest } = view;
	const not = rest.not?.filter((entry) => entry !== field);
	return not === undefined || not.length === 0 ? { ...rest, not: undefined } : { ...rest, not };
};

// The view with a field's set negated or restored.
export const toggleNegation = (view: View, field: NegatableField): View => {
	const not = view.not ?? [];
	const next = not.includes(field) ? not.filter((entry) => entry !== field) : [...not, field];
	return next.length === 0 ? { ...view, not: undefined } : { ...view, not: next };
};
