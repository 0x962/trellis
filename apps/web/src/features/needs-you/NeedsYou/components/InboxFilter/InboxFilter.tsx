import { Clock, EyeSlash, FunnelSimple } from "@phosphor-icons/react";
import type { NeedsYouListInput } from "@trellis/api";
import { Chip, FilterBar, FilterPopover, IconButton, useHotkey } from "@trellis/ui";
import { type ReactNode, useState } from "react";

type Visibility = NonNullable<NeedsYouListInput["visibility"]>;
const choices = [
	{ id: "active", label: "Active" },
	{ id: "snoozed", label: "Snoozed" },
	{ id: "ignored", label: "Ignored" },
];
export function InboxFilter({
	visibility,
	onChange,
	actions,
}: {
	visibility: Visibility;
	onChange: (next: Visibility) => void;
	actions: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	useHotkey("f", (event) => {
		if (document.activeElement?.closest('[role="dialog"]') !== null) return;
		event.preventDefault();
		setOpen(true);
	});
	return (
		<FilterBar
			filters={
				visibility !== "active" && (
					<Chip
						label="Items"
						value={choices.find((item) => item.id === visibility)!.label}
						icon={visibility === "snoozed" ? <Clock /> : <EyeSlash />}
						onValueClick={() => setOpen(true)}
						onRemove={() => onChange("active")}
						removeLabel="Remove items filter"
					/>
				)
			}
		>
			<FilterPopover
				open={open}
				onOpenChange={setOpen}
				label="Show items"
				placeholder="Show items"
				trigger={
					<IconButton
						label="Filter"
						icon={<FunnelSimple />}
						variant="default"
						pressed={visibility !== "active"}
						data-filter-button=""
					/>
				}
				items={choices.map((item) => ({ ...item, current: item.id === visibility }))}
				onSelect={(id) => {
					onChange(id as Visibility);
					setOpen(false);
				}}
			/>
			{actions}
		</FilterBar>
	);
}
