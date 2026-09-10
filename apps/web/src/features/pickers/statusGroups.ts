import { type StatusCategory, StatusCategorySchema, type StatusSummary } from "@trellis/api";
import type { CommandGroup } from "@trellis/ui";
import { StatusIcon } from "@trellis/ui";
import { createElement } from "react";

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
};

// The Command groups of a status list: one group per category in contract
// order, each option marked with its own icon. A status set that spans
// several roots repeats a slug; the first status of a slug stands for all.
export const statusGroups = (statuses: readonly StatusSummary[], options: StatusGroupOptions = {}): CommandGroup[] =>
	StatusCategorySchema.options
		.map((category) => ({
			heading: categoryLabels[category],
			icon: createElement(StatusIcon, { category }),
			items: statuses
				.filter((status) => status.category === category)
				.map((status) => ({
					id: status.id,
					label: status.name,
					keywords: [status.slug],
					icon: createElement(StatusIcon, { category, reviewer: status.reviewer ?? undefined }),
					current: status.id === options.current,
					checked: options.checked === undefined ? undefined : options.checked.includes(status.id),
				})),
		}))
		.filter((group) => group.items.length > 0);
