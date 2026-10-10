import { useQuery } from "@tanstack/react-query";
import { EpicNameSchema, type EpicSummary } from "@trellis/api";
import { Command, type CommandItem, Popover } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PickerFailure } from "../components/PickerFailure";
import { RowMarks } from "../components/RowMarks";
import { usePickerCreate } from "../hooks/usePickerCreate";
import { createNameItem } from "../utils/createNameItem";

const noneId = "none";

export type EpicItemOptions = {
	// The ref of the current epic.
	current?: string;
	// The single-value picker: each row shows a check on the current epic.
	picker?: boolean;
};

// One option per epic, in the order `epics.list` returns them: open first,
// then done. The option id is the canonical epic ref, `OP/routine-runtime`,
// which the URL and `tickets.update` both take. A done epic says so.
export const epicItems = (epics: readonly EpicSummary[], options: EpicItemOptions = {}): CommandItem[] =>
	epics.map((epic) => {
		const current = epic.ref === options.current;
		return {
			id: epic.ref,
			label: epic.name,
			keywords: [epic.ref, epic.slug],
			hint: epic.state === "done" ? "Done" : undefined,
			current,
			...(options.picker ? { trailing: createElement(RowMarks, { current, afterHint: true }) } : {}),
		};
	});

export type EpicPickerProps = {
	// The project ref whose epics the list holds. The list covers the
	// project and every project under it.
	project: string;
	scope?: string;
	// The ref of the current epic.
	value?: string;
	// True when the picker writes to several tickets that hold different
	// epics. No row then shows a check, so the list claims no shared value.
	mixed?: boolean;
	allowNone?: boolean;
	// `null` clears the epic.
	onPick: (epic: EpicSummary | null) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The epic popover: the epics of the project, searchable by name and ref,
// and a No epic option that clears the epic. `onPick` sends `null` for that
// option, and a bulk caller writes `epic: null` to every selected ticket.
export function EpicPicker({
	project,
	scope,
	value,
	mixed = false,
	allowNone = true,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: EpicPickerProps) {
	const { client, orpc, queryClient } = useApp();
	const [search, setSearch] = useState("");
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const list = useQuery({ ...orpc.epics.list.queryOptions({ input: { project } }), enabled: isOpen, retry: false });
	const epics = list.data ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
		onOpenChange?.(next);
		if (!next) {
			setSearch("");
			creation.reset();
		}
	};

	const creation = usePickerCreate({
		scope: JSON.stringify([project, scope]),
		create: (name) => client.epics.create({ project, name }),
		invalidate: () =>
			Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.projects.key() }),
			]),
		onCreated: (epic) => {
			onPick(epic);
			setOpen(false);
		},
	});
	const createItem = list.isSuccess
		? createNameItem(
				"epic",
				search,
				epics.map((epic) => epic.name),
				(name) => EpicNameSchema.safeParse(name).success,
			)
		: null;

	// The No epic row waits for the list, so every row mounts at once. cmdk
	// highlights the first row it mounts and keeps that row when more rows
	// arrive.
	const none = !mixed && value === undefined;
	const items: CommandItem[] =
		list.data === undefined
			? []
			: [
					...epicItems(epics, { current: mixed ? undefined : value, picker: true }),
					...(allowNone
						? [{ id: noneId, label: "No epic", current: none, trailing: createElement(RowMarks, { current: none }) }]
						: []),
				];

	return (
		<Popover
			trigger={trigger}
			label="Epic"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 max-w-(--available-width) max-h-(--available-height) overflow-y-auto p-0"
		>
			<Command
				inputRef={input}
				label="Search epics"
				placeholder="Set epic"
				items={createItem ? [...items, createItem] : items}
				onSearchChange={setSearch}
				listClassName={list.isError && items.length === 0 ? "hidden" : undefined}
				empty={list.isError ? "" : list.isPending ? "Load epics…" : "No epics."}
				onSelect={(id) => {
					if (creation.pending) return;
					if (id === createItem?.id) {
						creation.create(search.trim());
						return;
					}
					setOpen(false);
					onPick(id === noneId ? null : epics.find((epic) => epic.ref === id)!);
				}}
			/>
			{creation.pending && (
				<p role="status" className="px-3 py-2 text-sm text-fg-muted">
					Create epic…
				</p>
			)}
			{creation.error !== null && (
				<p role="alert" className="m-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{creation.error}
				</p>
			)}
			<PickerFailure
				title="Epics could not load."
				error={list.error}
				pending={list.isFetching}
				onRetry={list.refetch}
				input={input}
			/>
		</Popover>
	);
}
