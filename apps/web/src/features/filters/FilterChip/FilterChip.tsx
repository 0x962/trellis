import { ArrowElbowDownRight, Clock, FolderOpen, GitPullRequest, Stack, User } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { EpicSummary, StatusSummary } from "@trellis/api";
import { Chip, PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactElement } from "react";
import { useApp } from "../../../lib/appContext";
import { rootKey } from "../../../lib/projectPath";
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

export type FilterChipProps = {
	field: FilterField;
	view: View;
	statuses: readonly StatusSummary[];
	// The project ref of the route. An epic chip names its epic from the
	// epics of this project's root; on /all it prints the ref.
	project?: string;
	onChange: (view: View) => void;
	// Reopens the value picker for the field.
	onEdit: (field: FilterField) => void;
};

const iconOf = (field: FilterField, values: string[], statuses: readonly StatusSummary[]): ReactElement => {
	switch (field) {
		case "status": {
			const status = statuses.find((entry) => entry.slug === values[0] || entry.id === values[0]);
			return <StatusIcon category={status?.category ?? "todo"} reviewer={status?.reviewer ?? undefined} />;
		}
		case "category":
			return <StatusIcon category={(values[0] as StatusSummary["category"]) ?? "todo"} />;
		case "priority":
			return <PriorityIcon priority={(values[0] as "none") ?? "none"} />;
		case "project":
			return <FolderOpen />;
		case "parent":
			return <ArrowElbowDownRight />;
		case "epic":
			return <Stack />;
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
	epics: readonly EpicSummary[],
): string[] => {
	if (field !== "category") return values.map((value) => valueLabel(field, value, statuses, epics));
	return [...new Set(statuses.filter((status) => values.includes(status.category)).map((status) => status.name))];
};

// Two names, then a count of the rest: "In Progress, Agent Review +1".
const shortList = (names: string[]) =>
	names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");

// One active filter as a chip: the field, the operator, the values, and
// the remove button. The operator flips between is and is not on a
// negatable field; the values reopen the picker.
export function FilterChip({ field, view, statuses, project, onChange, onEdit }: FilterChipProps) {
	const { orpc } = useApp();
	const actors = useQuery({ ...orpc.actors.list.queryOptions({ input: {} }), enabled: field === "actor" }).data ?? [];
	const epics =
		useQuery({
			...orpc.epics.list.queryOptions({ input: { project: project === undefined ? "" : rootKey(project) } }),
			enabled: field === "epic" && project !== undefined,
		}).data ?? [];
	const values = valuesOf(view, field);
	const negated = view.not?.includes(field as NegatableField) ?? false;
	const canNegate = negatable.includes(field as NegatableField);
	const label = fieldLabels[field];
	const names =
		field === "actor"
			? values.map((value) => {
					const actor = actors.find((entry) => `${entry.kind}:${entry.name}` === value);
					return actor?.displayName ?? valueLabel(field, value, statuses);
				})
			: namesOf(field, values, statuses, epics);
	return (
		<span data-filter-chip={field} className="contents">
			<Chip
				icon={iconOf(field, values, statuses)}
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
