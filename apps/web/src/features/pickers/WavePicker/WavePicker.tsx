import type { WaveSummary } from "@trellis/api";
import { Command, type CommandGroup, type CommandItem, Popover } from "@trellis/ui";
import { createElement, type ReactElement, type RefObject, useRef, useState } from "react";
import { RowMarks } from "../components/RowMarks";
import { type EpicWaves, useEpicWaves } from "../hooks/useEpicWaves";

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
	// The ref of the current wave.
	value?: string;
	// True when the picker writes to several tickets that hold different
	// waves. No row then shows a check, so the list claims no shared value.
	mixed?: boolean;
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
	value,
	mixed = false,
	onPick,
	trigger,
	open,
	onOpenChange,
	finalFocus,
	side,
}: WavePickerProps) {
	const [own, setOwn] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const isOpen = open ?? own;
	const loaded = useEpicWaves([epic], isOpen)[0];
	const waves = loaded?.waves ?? [];

	const setOpen = (next: boolean) => {
		setOwn(next);
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
					{ id: noneId, label: "None", current: none, trailing: createElement(RowMarks, { current: none }) },
				];

	return (
		<Popover
			trigger={trigger}
			label="Wave"
			open={isOpen}
			onOpenChange={setOpen}
			initialFocus={input}
			finalFocus={finalFocus}
			side={side}
			className="w-72 p-0"
		>
			<Command
				inputRef={input}
				label="Search waves"
				placeholder="Set wave"
				items={items}
				empty={loaded === undefined ? "Load waves…" : "No waves."}
				onSelect={(id) => {
					setOpen(false);
					onPick(id === noneId ? null : waves.find((wave) => wave.ref === id)!);
				}}
			/>
		</Popover>
	);
}
