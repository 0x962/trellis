import type { MilestoneSummary } from "@trellis/api";
import { Command, type CommandGroup, type CommandItem, Popover } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { RowMarks } from "../components/RowMarks";
import { type EpicMilestones, useEpicMilestones } from "../hooks/useEpicMilestones";

const noneId = "none";

export type MilestoneItemOptions = {
	// The ref of the current milestone.
	current?: string;
	// The single-value picker: each row shows a check on the current milestone.
	picker?: boolean;
};

// One option per milestone, in position order. The option id is the
// canonical milestone ref, `OP/routine-runtime/phase-1`, which the URL and
// `tickets.update` both take. A done milestone says so.
export const milestoneItems = (
	milestones: readonly MilestoneSummary[],
	options: MilestoneItemOptions = {},
): CommandItem[] =>
	milestones.map((milestone) => {
		const current = milestone.ref === options.current;
		return {
			id: milestone.ref,
			label: milestone.name,
			keywords: [milestone.ref, milestone.slug],
			hint: milestone.state === "done" ? "Done" : undefined,
			current,
			...(options.picker ? { trailing: createElement(RowMarks, { current, afterHint: true }) } : {}),
		};
	});

// One section per epic that has a milestone, with the epic name as the
// heading. The epic name joins the keywords, so a search for the epic keeps
// its milestones.
export const milestoneGroups = (epics: readonly EpicMilestones[], options: MilestoneItemOptions = {}): CommandGroup[] =>
	epics
		.filter((entry) => entry.milestones.length > 0)
		.map((entry) => ({
			heading: entry.epic.name,
			items: milestoneItems(entry.milestones, options).map((item) => ({
				...item,
				keywords: [...(item.keywords ?? []), entry.epic.name],
			})),
		}));

export type MilestonePickerProps = {
	// The ref of the epic whose milestones the list holds.
	epic: string;
	// The ref of the current milestone.
	value?: string;
	// `null` clears the milestone.
	onPick: (milestone: MilestoneSummary | null) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The milestone popover: the milestones of one epic in position order,
// searchable by name and ref, and a None option that clears the milestone.
export function MilestonePicker({
	epic,
	value,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: MilestonePickerProps) {
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const loaded = useEpicMilestones([epic], isOpen)[0];
	const milestones = loaded?.milestones ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
	};

	// The None row waits for the list, so every row mounts at once. cmdk
	// highlights the first row it mounts and keeps that row when more rows
	// arrive.
	const none = value === undefined;
	const items: CommandItem[] =
		loaded === undefined
			? []
			: [
					...milestoneItems(milestones, { current: value, picker: true }),
					{ id: noneId, label: "None", current: none, trailing: createElement(RowMarks, { current: none }) },
				];

	return (
		<Popover
			trigger={trigger}
			label="Milestone"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 p-0"
		>
			<Command
				inputRef={input}
				label="Search milestones"
				placeholder="Set milestone"
				items={items}
				empty={loaded === undefined ? "Load milestones…" : "No milestones."}
				onSelect={(id) => {
					setOpen(false);
					onPick(id === noneId ? null : milestones.find((milestone) => milestone.ref === id)!);
				}}
			/>
		</Popover>
	);
}
