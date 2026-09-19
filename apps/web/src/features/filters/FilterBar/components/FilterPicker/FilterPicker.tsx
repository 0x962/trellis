import { useQuery } from "@tanstack/react-query";
import type { Actor, CiState, EpicSummary, PrFilter, Priority, StatusSummary } from "@trellis/api";
import { type CommandItem, FilterPopover } from "@trellis/ui";
import type { ReactElement } from "react";
import { useApp } from "../../../../../lib/appContext";
import { rootKey } from "../../../../../lib/projectPath";
import { epicItems } from "../../../../pickers/EpicPicker";
import { useEpicMilestones } from "../../../../pickers/hooks/useEpicMilestones";
import { milestoneGroups } from "../../../../pickers/MilestonePicker";
import { priorityItems } from "../../../../pickers/PriorityPicker";
import { projectItems } from "../../../../pickers/ProjectPicker";
import { statusGroups } from "../../../../pickers/statusGroups";
import {
	ciLabels,
	type FilterField,
	fieldLabels,
	multiValue,
	pickerFields,
	prLabels,
	timeLabels,
} from "../../../fields";
import type { View } from "../../../grammar";
import { type FilterLabel, labelValueGroups } from "../../../labelValues";
import { presets } from "../../../presets";

// The picker shows the fields first, then the values of one field. `scope`
// is not a filter field: it is the reach of the list, which a project route
// alone can change, so it takes its own stage.
export type PickerStage = { kind: "fields" } | { kind: "values"; field: FilterField } | { kind: "scope" };

const scopeField = "scope:field";
const scopeValues = [
	{ id: "subprojects", label: "This and all sub-projects" },
	{ id: "self", label: "This project only" },
] as const;

export type FilterPickerProps = {
	view: View;
	statuses: readonly StatusSummary[];
	// The labels of the project tree the route shows, already in row order.
	labels: readonly FilterLabel[];
	// The project ref of the route. /all offers the project field.
	project?: string;
	// The fields that the route fixes. The field list leaves them out.
	hiddenFields?: readonly FilterField[];
	// The epic ref that the route fixes. The Milestone values then list the
	// milestones of that epic alone, because a milestone of another epic
	// matches no ticket of the page.
	fixedEpic?: string;
	onChange: (view: View) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	stage: PickerStage;
	onStageChange: (stage: PickerStage) => void;
	trigger: ReactElement;
};

const presetId = (label: string) => `preset:${label}`;

const toggle = (values: readonly string[] | undefined, value: string) =>
	values?.includes(value) ? values.filter((entry) => entry !== value) : [...(values ?? []), value];

const emptyToUndefined = <T,>(values: T[]) => (values.length === 0 ? undefined : values);

// The field picker and the value pickers, in one popover anchored to the
// Filter button. A multi-value field toggles and stays open; every other
// field applies one value and closes.
export function FilterPicker({
	view,
	statuses,
	labels,
	project,
	hiddenFields = [],
	fixedEpic,
	onChange,
	open,
	onOpenChange,
	stage,
	onStageChange,
	trigger,
}: FilterPickerProps) {
	const { orpc } = useApp();
	const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: open }).data ?? [];
	const actors =
		useQuery({
			...orpc.actors.list.queryOptions({ input: {} }),
			enabled: open && stage.kind === "values" && stage.field === "actor",
		}).data ?? [];
	// The epic field and the milestone field list the epics of the root of the
	// viewed project. /all has no project, so it offers neither field.
	const epics =
		useQuery({
			...orpc.epics.list.queryOptions({ input: { project: project === undefined ? "" : rootKey(project) } }),
			enabled:
				open &&
				project !== undefined &&
				stage.kind === "values" &&
				(stage.field === "epic" || stage.field === "milestone"),
		}).data ?? [];
	const milestoneStage = open && stage.kind === "values" && stage.field === "milestone";
	const milestoneEpics = fixedEpic === undefined ? epics.map((epic) => epic.ref) : [fixedEpic];
	const epicMilestones = useEpicMilestones(milestoneStage ? milestoneEpics : []);

	const close = () => onOpenChange(false);

	const pickField = (id: string) => {
		if (id === scopeField) {
			onStageChange({ kind: "scope" });
			return;
		}
		const preset = presets.find((entry) => presetId(entry.label) === id);
		if (preset !== undefined) {
			onChange({ ...view, ...preset.view });
			close();
			return;
		}
		onStageChange({ kind: "values", field: id as FilterField });
	};

	const pickValue = (field: FilterField, id: string) => {
		const next = valueChange(view, field, id, statuses);
		onChange(next);
		if (!multiValue.includes(field)) close();
	};

	const scopeLabel = scopeValues.find((entry) => entry.id === view.scope)?.label ?? scopeValues[0].label;
	const fieldItems: CommandItem[] = [
		...(project === undefined ? [] : [{ id: scopeField, label: `Projects: ${scopeLabel}` }]),
		...presets.map((preset) => ({ id: presetId(preset.label), label: preset.label })),
		...pickerFields
			.filter((field) => !hiddenFields.includes(field))
			.filter((field) => field !== "project" || project === undefined)
			// The root project of a tree owns its labels, its epics, and their
			// milestones. A route without a project reads no one tree, so it offers
			// no Label field, no Epic field, and no Milestone field.
			.filter((field) => (field !== "label" && field !== "epic" && field !== "milestone") || project !== undefined)
			.map((field) => ({ id: field, label: fieldLabels[field] })),
	];

	// The Status and the Label values come in sections, so they take `groups`
	// and leave `items` empty. The Milestone values take both: the No milestone
	// item, then one section per epic.
	const sectioned = stage.kind === "values" && (stage.field === "status" || stage.field === "label");
	const groups =
		stage.kind === "values" && stage.field === "status"
			? statusGroups(statuses, { checked: checkedStatusIds(view, statuses) })
			: stage.kind === "values" && stage.field === "label"
				? labelValueGroups(labels, view.label ?? [])
				: milestoneStage
					? milestoneGroups(epicMilestones, { current: view.milestone })
					: [];
	const items =
		stage.kind === "scope"
			? scopeValues.map((entry) => ({ id: entry.id, label: entry.label, checked: view.scope === entry.id }))
			: stage.kind === "values" && !sectioned
				? valueItems(stage.field, view, projects, actors, epics)
				: fieldItems;

	const pickScope = (id: string) => {
		onChange({ ...view, scope: id as View["scope"] });
		close();
	};

	return (
		<FilterPopover
			trigger={trigger}
			open={open}
			onOpenChange={onOpenChange}
			stage={stage.kind === "values" ? stage.field : stage.kind}
			label={
				stage.kind === "values"
					? `Search ${fieldLabels[stage.field]} values`
					: stage.kind === "scope"
						? "Search the reach of the list"
						: "Search fields"
			}
			placeholder={
				stage.kind === "values" ? fieldLabels[stage.field] : stage.kind === "scope" ? "Projects" : "Filter by"
			}
			items={sectioned ? [] : items}
			groups={groups}
			onSelect={(id) =>
				stage.kind === "values" ? pickValue(stage.field, id) : stage.kind === "scope" ? pickScope(id) : pickField(id)
			}
		/>
	);
}

const checkedStatusIds = (view: View, statuses: readonly StatusSummary[]) =>
	statuses.filter((status) => view.status?.includes(status.slug)).map((status) => status.id);

type ProjectRow = Parameters<typeof projectItems>[0][number];

const valueItems = (
	field: FilterField,
	view: View,
	projects: readonly ProjectRow[],
	actors: readonly Actor[],
	epics: readonly EpicSummary[],
): CommandItem[] => {
	switch (field) {
		case "priority":
			return priorityItems({ checked: view.priority ?? [] });
		case "project":
			return projectItems(projects, view.project);
		case "parent":
			return [{ id: "none", label: "No parent", current: view.parent === "none" }];
		case "epic":
			return [
				{ id: "none", label: "No epic", current: view.epic === "none" },
				...epicItems(epics, { current: view.epic }),
			];
		case "milestone":
			return [{ id: "none", label: "No milestone", current: view.milestone === "none" }];
		case "pr":
		case "ci":
			return [
				...(Object.keys(prLabels) as PrFilter[]).map((value) => ({
					id: `pr:${value}`,
					label: prLabels[value],
					current: view.pr === value,
				})),
				...(Object.keys(ciLabels) as CiState[]).map((value) => ({
					id: `ci:${value}`,
					label: ciLabels[value],
					checked: view.ci?.includes(value) ?? false,
				})),
			];
		case "updated":
		case "created":
			return Object.entries(timeLabels).map(([value, label]) => ({ id: value, label, current: view[field] === value }));
		case "actor":
			return [
				{ id: "@agent", label: "Agents", current: view.actor === "@agent" },
				{ id: "@human", label: "Humans", current: view.actor === "@human" },
				...actors.map((actor) => ({
					id: `${actor.kind}:${actor.name}`,
					label: actor.displayName ?? actor.name,
					hint: actor.kind,
				})),
			];
		default:
			return [];
	}
};

// The view after one value pick.
const valueChange = (view: View, field: FilterField, id: string, statuses: readonly StatusSummary[]): View => {
	switch (field) {
		case "status": {
			const slug = statuses.find((status) => status.id === id)?.slug ?? id;
			return { ...view, status: emptyToUndefined(toggle(view.status, slug)) };
		}
		case "priority":
			return { ...view, priority: emptyToUndefined(toggle(view.priority, id) as Priority[]) };
		case "label":
			return { ...view, label: emptyToUndefined(toggle(view.label, id)) };
		case "project":
			return { ...view, project: id };
		case "parent":
			return { ...view, parent: "none" };
		case "epic":
			return { ...view, epic: id };
		case "milestone":
			return { ...view, milestone: id };
		case "pr":
		case "ci":
			return id.startsWith("pr:")
				? { ...view, pr: id.slice(3) as PrFilter }
				: { ...view, ci: emptyToUndefined(toggle(view.ci, id.slice(3)) as CiState[]) };
		case "updated":
		case "created":
			return { ...view, [field]: id };
		case "actor":
			return { ...view, actor: id };
		default:
			return view;
	}
};
