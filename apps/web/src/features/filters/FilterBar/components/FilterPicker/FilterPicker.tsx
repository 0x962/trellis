import { useQuery } from "@tanstack/react-query";
import type { StatusSummary } from "@trellis/api";
import { type CommandItem, FilterPopover, StatusIcon } from "@trellis/ui";
import { type AriaAttributes, type ReactElement, useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { EpicPicker } from "../../../../pickers/EpicPicker";
import { useEpicWaves } from "../../../../pickers/hooks/useEpicWaves";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";
import { statusGroups } from "../../../../pickers/statusGroups";
import { WavePicker, waveGroups } from "../../../../pickers/WavePicker";
import { type FilterField, fieldLabels, multiValue, pickerFields } from "../../../fields";
import type { View } from "../../../grammar";
import { type FilterLabel, labelValueGroups } from "../../../labelValues";
import { presets } from "../../../presets";
import { checkedStatusIds, valueChange, valueItems } from "./filterValues";
import { useFilterCreate } from "./hooks/useFilterCreate";

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
	trigger: ReactElement<AriaAttributes & { id?: string; disabled?: boolean }>;
};

const presetId = (label: string) => `preset:${label}`;

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
	const [search, setSearch] = useState("");
	useEffect(() => {
		if (!open || stage.kind === "fields") setSearch("");
	}, [stage.kind, open]);
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
	const dependencySearch = useQuery({
		...orpc.search.query.queryOptions({
			input: { q: ticketQuery, project: project === undefined ? undefined : project, limit: 10 },
		}),
		enabled: waitsOnStage && ticketQuery !== "",
	});
	const dependencyTickets = dependencySearch.data?.tickets ?? [];

	const close = () => onOpenChange(false);
	const field = stage.kind === "values" ? stage.field : undefined;
	const creation = useFilterCreate({
		field,
		open,
		search,
		project,
		view,
		onChange,
		close,
		ticketNames: dependencyTickets.flatMap((ticket) => [ticket.title, ticket.identifier]),
		ticketReady: dependencySearch.isSuccess && ticketQuery === search.trim(),
	});

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
				icon: <StatusIcon category={ticket.status.category} />,
				children: <span className="truncate text-fg-muted">{ticket.title}</span>,
			}))
		: stage.kind === "values" && !sectioned
			? valueItems(stage.field, view, projects, actors, epics)
			: fieldItems;

	if (field === "epic" && project)
		return (
			<>
				<EpicPicker
					project={project}
					value={view.epic}
					open={open}
					onOpenChange={onOpenChange}
					trigger={trigger}
					onPick={(epic) => {
						onChange({ ...view, epic: epic?.ref ?? "none" });
						close();
					}}
				/>
				{creation.dialog}
			</>
		);
	const selectedEpic = fixedEpic ?? (view.epic !== "none" ? view.epic : undefined);
	if (field === "wave" && selectedEpic)
		return (
			<>
				<WavePicker
					epic={selectedEpic}
					value={view.wave}
					open={open}
					onOpenChange={onOpenChange}
					trigger={trigger}
					onPick={(wave) => {
						onChange({ ...view, wave: wave?.ref ?? "none" });
						close();
					}}
				/>
				{creation.dialog}
			</>
		);
	if (field === "project")
		return (
			<>
				<ProjectPicker
					projects={projects}
					value={view.project}
					includeArchived
					open={open}
					onOpenChange={onOpenChange}
					trigger={trigger}
					onPick={(key) => {
						onChange({ ...view, project: key });
						close();
					}}
				/>
				{creation.dialog}
			</>
		);
	return (
		<>
			<FilterPopover
				trigger={trigger}
				open={open}
				onOpenChange={onOpenChange}
				stage={stage.kind === "values" ? stage.field : stage.kind}
				label={stage.kind === "values" ? `Search ${fieldLabels[stage.field]} values` : "Search fields"}
				placeholder={stage.kind === "values" ? fieldLabels[stage.field] : "Filter by"}
				items={[...(sectioned ? [] : items), ...(creation.item ? [creation.item] : [])]}
				groups={groups}
				filter={waitsOnStage ? false : undefined}
				onSearchChange={(value) => {
					setSearch(value);
					if (waitsOnStage) setTicketSearch(value);
				}}
				empty={waitsOnStage && ticketQuery === "" ? "Type to search." : undefined}
				onSelect={(id) => {
					if (id === creation.item?.id) creation.pick();
					else if (stage.kind === "values") pickValue(stage.field, id);
					else pickField(id);
				}}
			/>
			{creation.dialog}
		</>
	);
}
