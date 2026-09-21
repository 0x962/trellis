import {
	ArrowElbowDownRight,
	Clock,
	Flag,
	FolderOpen,
	GitPullRequest,
	LockSimple,
	Stack,
	Tag,
	User,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { EpicSummary, StatusSummary, WaveSummary } from "@trellis/api";
import { Chip, LabelDot, PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactElement } from "react";
import { useApp } from "../../../lib/appContext";
import { rootKey } from "../../../lib/projectPath";
import { useEpicWaves } from "../../pickers/hooks/useEpicWaves";
import {
	type FilterField,
	fieldLabels,
	negatable,
	opLabel,
	toggleNegation,
	valueLabel,
	valuesOf,
	withoutField,
} from "../fields";
import type { NegatableField, View } from "../grammar";
import type { FilterLabel } from "../labelValues";

export type FilterChipProps = {
	field: FilterField;
	view: View;
	statuses: readonly StatusSummary[];
	// The labels of the project tree the route shows. It is empty on a route
	// with no project, where the Label field never gets a chip.
	labels: readonly FilterLabel[];
	// The project ref of the route. An epic chip names its epic from the
	// epics of this project's root; on /all it prints the ref.
	project?: string;
	onChange: (view: View) => void;
	// Reopens the value picker for the field.
	onEdit: (field: FilterField) => void;
};

const iconOf = (
	field: FilterField,
	values: string[],
	statuses: readonly StatusSummary[],
	labels: readonly FilterLabel[],
): ReactElement => {
	switch (field) {
		case "status": {
			const status = statuses.find((entry) => entry.slug === values[0] || entry.id === values[0]);
			return <StatusIcon category={status?.category ?? "todo"} reviewer={status?.reviewer ?? undefined} />;
		}
		case "category":
			return <StatusIcon category={(values[0] as StatusSummary["category"]) ?? "todo"} />;
		case "priority":
			return <PriorityIcon priority={(values[0] as "none") ?? "none"} />;
		case "label": {
			const label = labels.find((entry) => entry.ref === values[0]);
			if (label === undefined) return <Tag />;
			return <LabelDot color={label.color} variant="icon" />;
		}
		case "project":
			return <FolderOpen />;
		case "parent":
		case "waitsOn":
			return <ArrowElbowDownRight />;
		case "blocked":
			return <LockSimple />;
		case "epic":
			return <Stack />;
		case "wave":
			return <Flag />;
		case "pr":
		case "ci":
			return <GitPullRequest />;
		case "updated":
		case "created":
			return <Clock />;
		case "actor":
			return <User />;
	}
};

// The names a chip prints for its values. A status or a category chip names
// the statuses of the scope, so it reads like the cells; one name shows once
// even when several projects hold it.
const namesOf = (
	field: FilterField,
	values: string[],
	statuses: readonly StatusSummary[],
	labels: readonly FilterLabel[],
	epics: readonly EpicSummary[],
	waves: readonly WaveSummary[],
): string[] => {
	if (field !== "category") {
		return values.map((value) => valueLabel(field, value, statuses, labels, epics, waves));
	}
	return [...new Set(statuses.filter((status) => values.includes(status.category)).map((status) => status.name))];
};

// Two names, then a count of the rest: "In Progress, Agent Review +1".
const shortList = (names: string[]) =>
	names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");

// The epic ref inside a wave ref: `OP/routine-runtime/phase-1` gives
// `OP/routine-runtime`. A ULID and `none` name no epic.
const epicRefOf = (wave: string) => {
	const parts = wave.split("/");
	return parts.length === 3 ? [`${parts[0]}/${parts[1]}`] : [];
};

// One active filter as a chip: the field, the operator, the values, and
// the remove button. The operator flips between is and is not on a
// negatable field; the values reopen the picker.
export function FilterChip({ field, view, statuses, labels, project, onChange, onEdit }: FilterChipProps) {
	const { orpc } = useApp();
	const actors = useQuery({ ...orpc.actors.list.queryOptions({ input: {} }), enabled: field === "actor" }).data ?? [];
	const epics =
		useQuery({
			...orpc.epics.list.queryOptions({ input: { project: project === undefined ? "" : rootKey(project) } }),
			enabled: field === "epic" && project !== undefined,
		}).data ?? [];
	const values = valuesOf(view, field);
	const waves = useEpicWaves(field === "wave" ? values.flatMap(epicRefOf) : []).flatMap((entry) => entry.waves);
	const negated = view.not?.includes(field as NegatableField) ?? false;
	const canNegate = negatable.includes(field as NegatableField);
	const label = fieldLabels[field];
	const names =
		field === "actor"
			? values.map((value) => {
					const actor = actors.find((entry) => `${entry.kind}:${entry.name}` === value);
					return actor?.displayName ?? valueLabel(field, value, statuses);
				})
			: namesOf(field, values, statuses, labels, epics, waves);
	return (
		<span data-filter-chip={field} className="contents">
			<Chip
				icon={iconOf(field, values, statuses, labels)}
				label={label}
				op={opLabel(field, negated)}
				value={shortList(names)}
				onOpClick={canNegate ? () => onChange(toggleNegation(view, field as NegatableField)) : undefined}
				onValueClick={() => onEdit(field)}
				onRemove={() => onChange(withoutField(view, field))}
				removeLabel={`Remove ${label} filter`}
			/>
		</span>
	);
}
