import { useQuery } from "@tanstack/react-query";
import type { Actor, CiState, EpicSummary, PrFilter, Priority, StatusSummary } from "@trellis/api";
import { type CommandItem, FilterPopover, StatusIcon } from "@trellis/ui";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { epicItems } from "../../../../pickers/EpicPicker";
import { useEpicWaves } from "../../../../pickers/hooks/useEpicWaves";
import { priorityItems } from "../../../../pickers/PriorityPicker";
import { projectItems } from "../../../../pickers/ProjectPicker";
import { statusGroups } from "../../../../pickers/statusGroups";
import { waveGroups } from "../../../../pickers/WavePicker";
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

// The picker shows the fields first, then the values of one field.
export type PickerStage = { kind: "fields" } | { kind: "values"; field: FilterField };

export type FilterPickerProps = {
	view: View;
	statuses: readonly StatusSummary[];
	// The labels of the project the route shows, already in row order.
	labels: readonly FilterLabel[];
	// The project ref of the route. /all offers the project field.
	project?: string;
	// The fields that the route fixes. The field list leaves them out.
	hiddenFields?: readonly FilterField[];
	// The epic ref that the route fixes. The Wave values then list the
	// waves of that epic alone, because a wave of another epic
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
	const [ticketSearch, setTicketSearch] = useState("");
	const [ticketQuery, setTicketQuery] = useState("");
	const waitsOnStage = open && stage.kind === "values" && stage.field === "waitsOn";
	useEffect(() => {
		const timer = setTimeout(() => setTicketQuery(ticketSearch.trim()), 120);
		return () => clearTimeout(timer);
	}, [ticketSearch]);
	useEffect(() => {
		if (!waitsOnStage) setTicketSearch("");
	}, [waitsOnStage]);
	const projects = useQuery({ ...orpc.projects.list.queryOptions({ input: {} }), enabled: open }).data ?? [];
	const actors =
		useQuery({
			...orpc.actors.list.queryOptions({ input: {} }),
			enabled: open && stage.kind === "values" && stage.field === "actor",
		}).data ?? [];
	// The epic field and the wave field list the epics of the root of the
	// viewed project. /all has no project, so it offers neither field.
	const epics =
		useQuery({
			...orpc.epics.list.queryOptions({ input: { project: project === undefined ? "" : project } }),
			enabled:
				open && project !== undefined && stage.kind === "values" && (stage.field === "epic" || stage.field === "wave"),
		}).data ?? [];
	const waveStage = open && stage.kind === "values" && stage.field === "wave";
	const waveEpics = fixedEpic === undefined ? epics.map((epic) => epic.ref) : [fixedEpic];
	const epicWaves = useEpicWaves(waveStage ? waveEpics : []);
	const dependencyTickets =
		useQuery({
			...orpc.search.query.queryOptions({
				input: { q: ticketQuery, project: project === undefined ? undefined : project, limit: 10 },
			}),
			enabled: waitsOnStage && ticketQuery !== "",
		}).data?.tickets ?? [];

	const close = () => onOpenChange(false);

	const pickField = (id: string) => {
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

	const fieldItems: CommandItem[] = [
		...presets.map((preset) => ({ id: presetId(preset.label), label: preset.label })),
		...pickerFields
			.filter((field) => !hiddenFields.includes(field))
			.filter((field) => field !== "project" || project === undefined)
			// A project owns its labels, its epics, and their waves. A route
			// without a project reads no one project, so it offers no Label
			// field, no Epic field, and no Wave field.
			.filter((field) => (field !== "label" && field !== "epic" && field !== "wave") || project !== undefined)
			.map((field) => ({ id: field, label: fieldLabels[field] })),
	];

	// The Status and the Label values come in sections, so they take `groups`
	// and leave `items` empty. The Wave values take both: the No wave
	// item, then one section per epic.
	const sectioned = stage.kind === "values" && (stage.field === "status" || stage.field === "label");
	const groups =
		stage.kind === "values" && stage.field === "status"
			? statusGroups(statuses, { checked: checkedStatusIds(view, statuses) })
			: stage.kind === "values" && stage.field === "label"
				? labelValueGroups(labels, view.label ?? [])
				: waveStage
					? waveGroups(epicWaves, { current: view.wave })
					: [];
	const items = waitsOnStage
		? dependencyTickets.map((ticket) => ({
				id: ticket.identifier,
				label: ticket.identifier,
				current: view.waitsOn === ticket.identifier,
				icon: <StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />,
				children: <span className="truncate text-fg-muted">{ticket.title}</span>,
			}))
		: stage.kind === "values" && !sectioned
			? valueItems(stage.field, view, projects, actors, epics)
			: fieldItems;

	return (
		<FilterPopover
			trigger={trigger}
			open={open}
			onOpenChange={onOpenChange}
			stage={stage.kind === "values" ? stage.field : stage.kind}
			label={stage.kind === "values" ? `Search ${fieldLabels[stage.field]} values` : "Search fields"}
			placeholder={stage.kind === "values" ? fieldLabels[stage.field] : "Filter by"}
			items={sectioned ? [] : items}
			groups={groups}
			filter={waitsOnStage ? false : undefined}
			onSearchChange={waitsOnStage ? setTicketSearch : undefined}
			empty={waitsOnStage && ticketQuery === "" ? "Type to search." : undefined}
			onSelect={(id) => (stage.kind === "values" ? pickValue(stage.field, id) : pickField(id))}
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
		case "blocked":
			return [
				{ id: "true", label: "Blocked", current: view.blocked === true },
				{ id: "false", label: "Not blocked", current: view.blocked === false },
			];
		case "epic":
			return [
				{ id: "none", label: "No epic", current: view.epic === "none" },
				...epicItems(epics, { current: view.epic }),
			];
		case "wave":
			return [{ id: "none", label: "No wave", current: view.wave === "none" }];
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
		case "waitsOn":
			return { ...view, waitsOn: id };
		case "blocked":
			return { ...view, blocked: id === "true" };
		case "epic":
			return { ...view, epic: id };
		case "wave":
			return { ...view, wave: id };
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
