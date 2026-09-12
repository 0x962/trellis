import { ArrowElbowDownRight, Clock, FolderOpen, GitPullRequest, User } from "@phosphor-icons/react";
import type { StatusSummary } from "@trellis/api";
import { Chip, PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactElement } from "react";
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
const namesOf = (field: FilterField, values: string[], statuses: readonly StatusSummary[]): string[] => {
	if (field !== "category") return values.map((value) => valueLabel(field, value, statuses));
	return [...new Set(statuses.filter((status) => values.includes(status.category)).map((status) => status.name))];
};

// Two names, then a count of the rest: "In Progress, Agent Review +1".
const shortList = (names: string[]) =>
	names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");

// One active filter as a chip: the field, the operator, the values, and
// the remove button. The operator flips between is and is not on a
// negatable field; the values reopen the picker.
export function FilterChip({ field, view, statuses, onChange, onEdit }: FilterChipProps) {
	const values = valuesOf(view, field);
	const negated = view.not?.includes(field as NegatableField) ?? false;
	const canNegate = negatable.includes(field as NegatableField);
	const label = fieldLabels[field];
	return (
		<span data-filter-chip={field} className="contents">
			<Chip
				icon={iconOf(field, values, statuses)}
				label={label}
				op={opLabel(field, negated)}
				value={shortList(namesOf(field, values, statuses))}
				onOpClick={canNegate ? () => onChange(toggleNegation(view, field as NegatableField)) : undefined}
				onValueClick={() => onEdit(field)}
				onRemove={() => onChange(withoutField(view, field))}
				removeLabel={`Remove ${label} filter`}
			/>
		</span>
	);
}
