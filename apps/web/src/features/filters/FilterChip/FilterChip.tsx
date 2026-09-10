import type { StatusSummary } from "@trellis/api";
import { Chip, PriorityIcon, StatusIcon } from "@trellis/ui";
import { Clock, CornerDownRight, FolderOpen, GitPullRequestArrow, User } from "lucide-react";
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
			return <CornerDownRight />;
		case "pr":
		case "ci":
			return <GitPullRequestArrow />;
		case "updated":
		case "created":
			return <Clock />;
		case "actor":
			return <User />;
	}
};

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
				value={values.map((value) => valueLabel(field, value, statuses)).join(", ")}
				onOpClick={canNegate ? () => onChange(toggleNegation(view, field as NegatableField)) : undefined}
				onValueClick={() => onEdit(field)}
				onRemove={() => onChange(withoutField(view, field))}
				removeLabel={`Remove ${label} filter`}
			/>
		</span>
	);
}
