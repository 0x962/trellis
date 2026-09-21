import { type StatusCategory, StatusCategorySchema, type StatusSummary } from "@trellis/api";
import type { CommandGroup } from "@trellis/ui";
import { StatusIcon } from "@trellis/ui";
import { createElement } from "react";
import { statusIconProps } from "../statusIconProps";
import { RowMarks } from "./components/RowMarks";

export const categoryLabels: Record<StatusCategory, string> = {
	todo: "Todo",
	started: "Started",
	review: "Review",
	done: "Done",
	canceled: "Canceled",
};

export type StatusGroupOptions = {
	// The id of the status the field holds now.
	current?: string;
	// The ids of a multi-value set; every option then carries `data-checked`.
	checked?: readonly string[];
	// The single-value picker. Each row shows a check on the current status
	// and the number key (1 to 9) that picks it. A category gets a heading
	// only when 2 or more statuses share it, because one status per category
	// already shows its category by its icon. A heading has no icon.
	picker?: boolean;
};

// The highest number key. A tenth status has no key.
const lastKey = 9;

// The Command groups of a status list: one group per category in contract
// order, each option marked with its own icon. A status set that spans
// several roots repeats a slug; the first status of a slug stands for all.
export const statusGroups = (statuses: readonly StatusSummary[], options: StatusGroupOptions = {}): CommandGroup[] => {
	const picker = options.picker ?? false;
	let key = 0;
	return StatusCategorySchema.options
		.map((category) => {
			const members = statuses.filter((status) => status.category === category);
			return {
				heading: picker && members.length < 2 ? undefined : categoryLabels[category],
				icon: picker ? undefined : createElement(StatusIcon, { category }),
				items: members.map((status) => {
					key += 1;
					const current = status.id === options.current;
					return {
						id: status.id,
						label: status.name,
						keywords: [status.slug],
						icon: createElement(StatusIcon, statusIconProps(status)),
						current,
						checked: options.checked === undefined ? undefined : options.checked.includes(status.id),
						...(picker
							? { trailing: createElement(RowMarks, { current, keyLabel: key > lastKey ? undefined : String(key) }) }
							: {}),
					};
				}),
			};
		})
		.filter((group) => group.items.length > 0);
};
