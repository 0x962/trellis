import { useQuery } from "@tanstack/react-query";
import type { Status, StatusSummary } from "@trellis/api";
import { Command, Popover } from "@trellis/ui";
import { type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { StatusCreateDialog } from "../../project-settings/StatusCreateDialog";
import { pickerListClass } from "../pickerListClass";
import { statusGroups } from "../statusGroups";
import { createNameItem } from "../utils/createNameItem";
import { keyPick } from "../utils/keyPick";

export type StatusPickerProps<S extends StatusSummary> = {
	statuses: readonly S[];
	project?: string;
	scope?: string;
	// The id of the current status.
	value?: string;
	onPick: (status: S | Status) => void;
	trigger: ReactElement;
	// The words the trigger shows on hover and on keyboard focus. The
	// popover hides them while it is open.
	triggerTooltip?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	// The element that takes focus when the picker closes.
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The status popover: one searchable list in category order. Enter
// applies the highlighted status and closes; a number key picks its row
// while the search is empty; Escape closes and changes nothing.
export function StatusPicker<S extends StatusSummary>({
	statuses,
	project,
	scope,
	value,
	onPick,
	trigger,
	triggerTooltip,
	open,
	onOpenChange,
	finalFocus,
	side,
}: StatusPickerProps<S>) {
	const { orpc } = useApp();
	const createScope = JSON.stringify([project, scope]);
	const [own, setOwn] = useState(false);
	const [search, setSearch] = useState("");
	const [createName, setCreateName] = useState<{ name: string; scope: string } | null>(null);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const activeCreateName = createName?.scope === createScope ? (createName?.name ?? null) : null;
	const allStatuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: isOpen && !!project,
	});
	const setOpen = (next: boolean) => {
		setOwn(next);
		if (!next) setSearch("");
		onOpenChange?.(next);
	};
	const pick = (status: S | Status) => {
		setOpen(false);
		onPick(status);
	};
	const createItem =
		project && allStatuses.isSuccess
			? createNameItem(
					"status",
					search,
					allStatuses.data.statuses.map((status) => status.name),
				)
			: null;
	const groups = statusGroups(statuses, { current: value, picker: true });
	// The rows in display order. The first 9 take the keys 1 to 9, the same
	// numbers `statusGroups` draws on them.
	const ordered = groups.flatMap((group) =>
		group.items.map((item) => statuses.find((status) => status.id === item.id)!),
	);
	const picks = new Map(ordered.slice(0, 9).map((status, index) => [String(index + 1), () => pick(status)]));
	return (
		<>
			<Popover
				trigger={trigger}
				triggerTooltip={triggerTooltip}
				label="Status"
				open={isOpen && activeCreateName === null}
				onOpenChange={(next) => {
					if (activeCreateName === null) setOpen(next);
				}}
				initialFocus={input}
				finalFocus={finalFocus}
				side={side}
				className="w-64 p-0"
			>
				<div onKeyDownCapture={keyPick(picks, input)}>
					<Command
						inputRef={input}
						label="Search statuses"
						placeholder="Change status"
						groups={groups}
						items={createItem ? [createItem] : []}
						onSearchChange={setSearch}
						listClassName={pickerListClass}
						onSelect={(id) => {
							if (id === createItem?.id) setCreateName({ name: search.trim(), scope: createScope });
							else pick(statuses.find((status) => status.id === id)!);
						}}
					/>
				</div>
			</Popover>
			{activeCreateName !== null && project && (
				<StatusCreateDialog
					project={project}
					scope={scope}
					initialName={activeCreateName}
					onClose={() => setCreateName(null)}
					onCreated={(status) => {
						setCreateName(null);
						pick(status);
					}}
				/>
			)}
		</>
	);
}
