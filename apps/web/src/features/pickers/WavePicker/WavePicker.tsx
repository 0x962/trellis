import { useQuery } from "@tanstack/react-query";
import { WaveNameSchema, type WaveSummary } from "@trellis/api";
import { Command, type CommandGroup, type CommandItem, Popover } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { PickerFailure } from "../components/PickerFailure";
import { RowMarks } from "../components/RowMarks";
import type { EpicWaves } from "../hooks/useEpicWaves";
import { usePickerCreate } from "../hooks/usePickerCreate";
import { createNameItem } from "../utils/createNameItem";

const noneId = "none";

export type WaveItemOptions = {
	// The ref of the current wave.
	current?: string;
	// The single-value picker: each row shows a check on the current wave.
	picker?: boolean;
};

// One option per wave, in position order. The option id is the
// canonical wave ref, `OP/routine-runtime/phase-1`, which the URL and
// `tickets.update` both take. A done wave says so.
export const waveItems = (waves: readonly WaveSummary[], options: WaveItemOptions = {}): CommandItem[] =>
	waves.map((wave) => {
		const current = wave.ref === options.current;
		return {
			id: wave.ref,
			label: wave.name,
			keywords: [wave.ref, wave.slug],
			hint: wave.state === "done" ? "Done" : undefined,
			current,
			...(options.picker ? { trailing: createElement(RowMarks, { current, afterHint: true }) } : {}),
		};
	});

// One section per epic that has a wave, with the epic name as the
// heading. The epic name joins the keywords, so a search for the epic keeps
// its waves.
export const waveGroups = (epics: readonly EpicWaves[], options: WaveItemOptions = {}): CommandGroup[] =>
	epics
		.filter((entry) => entry.waves.length > 0)
		.map((entry) => ({
			heading: entry.epic.name,
			items: waveItems(entry.waves, options).map((item) => ({
				...item,
				keywords: [...(item.keywords ?? []), entry.epic.name],
			})),
		}));

export type WavePickerProps = {
	// The ref of the epic whose waves the list holds.
	epic: string;
	scope?: string;
	// The ref of the current wave.
	value?: string;
	// True when the picker writes to several tickets that hold different
	// waves. No row then shows a check, so the list claims no shared value.
	mixed?: boolean;
	allowNone?: boolean;
	// `null` clears the wave.
	onPick: (wave: WaveSummary | null) => void;
	trigger: ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	finalFocus?: RefObject<HTMLElement | null>;
	side?: "top" | "bottom";
};

// The wave popover: the waves of one epic in position order,
// searchable by name and ref, and a None option that clears the wave.
export function WavePicker({
	epic,
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
}: WavePickerProps) {
	const { client, orpc, queryClient } = useApp();
	const [own, setOwn] = useState(false);
	const [search, setSearch] = useState("");
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const list = useQuery({ ...orpc.epics.get.queryOptions({ input: { epic } }), enabled: isOpen, retry: false });
	const loaded = list.data;
	const waves = loaded?.waves ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
		// The search field opens empty each time.
		if (!next) {
			setSearch("");
			creation.reset();
		}
		onOpenChange?.(next);
	};

	// The None row waits for the list, so every row mounts at once. cmdk
	// highlights the first row it mounts and keeps that row when more rows
	// arrive.
	const none = !mixed && value === undefined;
	const items: CommandItem[] =
		loaded === undefined
			? []
			: [
					...waveItems(waves, { current: mixed ? undefined : value, picker: true }),
					...(allowNone
						? [{ id: noneId, label: "No wave", current: none, trailing: createElement(RowMarks, { current: none }) }]
						: []),
				];
	const creation = usePickerCreate({
		scope: JSON.stringify([epic, scope]),
		create: (name) => client.waves.create({ epic, name }),
		invalidate: () => queryClient.invalidateQueries({ queryKey: orpc.epics.key() }),
		onCreated: (wave) => {
			onPick(wave);
			setOpen(false);
		},
	});
	const createItem = list.isSuccess
		? createNameItem(
				"wave",
				search,
				waves.map((wave) => wave.name),
				(name) => WaveNameSchema.safeParse(name).success,
			)
		: null;

	return (
		<Popover
			trigger={trigger}
			label="Wave"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 max-w-(--available-width) max-h-(--available-height) overflow-y-auto p-0"
		>
			<Command
				inputRef={input}
				label="Search waves"
				placeholder="Set wave"
				items={createItem ? [...items, createItem] : items}
				listClassName={list.isError && items.length === 0 ? "hidden" : undefined}
				onSearchChange={setSearch}
				empty={list.isError ? "" : list.isPending ? "Load waves…" : "No waves."}
				onSelect={(id) => {
					if (creation.pending) return;
					if (id === createItem?.id) {
						creation.create(search.trim());
						return;
					}
					setOpen(false);
					onPick(id === noneId ? null : waves.find((wave) => wave.ref === id)!);
				}}
			/>
			{creation.pending && (
				<p role="status" className="px-3 py-2 text-sm text-fg-muted">
					Create wave…
				</p>
			)}
			{creation.error !== null && (
				<p role="alert" className="m-1 rounded-sm bg-danger-soft px-2 py-1.5 text-sm text-danger">
					{creation.error}
				</p>
			)}
			<PickerFailure
				title="Waves could not load."
				error={list.error}
				pending={list.isFetching}
				onRetry={list.refetch}
				input={input}
			/>
		</Popover>
	);
}
