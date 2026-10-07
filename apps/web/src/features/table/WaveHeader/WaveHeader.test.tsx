import { expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import { Badge } from "@trellis/ui";
import type { KeyboardEvent, ReactElement } from "react";
import type { WaveEditing } from "../hooks/useWaveEditing";
import type { TableGroup } from "../utils/flattenGroups";
import type { WaveActionsProps } from "./components/WaveActions/WaveActions";
import { WaveName } from "./components/WaveName";
import { waveHeaderParts } from "./WaveHeader";

const wave = {
	id: "wave-1",
	ref: "TRL/epic/wave-1",
	name: "Foundation",
	state: "open",
	counts: { done: 1, total: 3, canceled: 0 },
} as WaveSummary;

const group = {
	key: wave.id,
	label: wave.name,
	rows: [],
	count: 0,
	expanded: true,
	wave: { id: wave.id, ref: wave.ref, name: wave.name },
} as TableGroup;

const fixture = (input?: { renamingId?: string | null; canMove?: (step: -1 | 1) => boolean }) => {
	const moved: number[] = [];
	const renamed: string[] = [];
	const editing = {
		waves: [wave],
		renamingId: input?.renamingId ?? null,
		startRename: (id: string) => renamed.push(id),
		move: (_id: string, step: -1 | 1) => moved.push(step),
		canMove: (_id: string, step: -1 | 1) => input?.canMove?.(step) ?? true,
	} as unknown as WaveEditing;
	const parts = waveHeaderParts(group, {
		editing,
		project: "TRL",
		onAddTicket: () => {},
		onNewTicket: () => {},
	});
	return { moved, renamed, parts: parts! };
};

const key = (value: string, options?: { altKey?: boolean; shiftKey?: boolean }) => {
	let prevented = false;
	return {
		event: {
			key: value,
			altKey: options?.altKey ?? false,
			shiftKey: options?.shiftKey ?? false,
			preventDefault: () => {
				prevented = true;
			},
		} as unknown as KeyboardEvent<HTMLButtonElement>,
		prevented: () => prevented,
	};
};

test("F2 opens the wave name field and prevents the browser action", () => {
	const { parts, renamed } = fixture();
	const input = key("F2");

	parts.onKeyDown?.(input.event);

	expect(renamed).toEqual([wave.id]);
	expect(input.prevented()).toBe(true);
});

test("Alt Shift and an arrow moves the wave one place", () => {
	const { parts, moved } = fixture();
	const up = key("ArrowUp", { altKey: true, shiftKey: true });
	const down = key("ArrowDown", { altKey: true, shiftKey: true });

	parts.onKeyDown?.(up.event);
	parts.onKeyDown?.(down.event);

	expect(moved).toEqual([-1, 1]);
	expect(up.prevented()).toBe(true);
	expect(down.prevented()).toBe(true);
});

test("an arrow without both modifiers leaves the wave in place", () => {
	const { parts, moved } = fixture();
	const input = key("ArrowDown", { altKey: true });

	parts.onKeyDown?.(input.event);

	expect(moved).toEqual([]);
	expect(input.prevented()).toBe(false);
});

test("the action states follow the movement boundaries", () => {
	const { parts } = fixture({ canMove: (step) => step === 1 });
	const actions = parts.actions as ReactElement<WaveActionsProps>;

	expect(actions.props.first).toBe(true);
	expect(actions.props.last).toBe(false);
});

test("rename replaces the resting label with the canonical name field", () => {
	const { parts } = fixture({ renamingId: wave.id });
	const field = parts.labelField as ReactElement;

	expect(field.type).toBe(WaveName);
});

test("the first open wave gets the canonical Current badge", () => {
	const { parts } = fixture();
	const mark = parts.mark as ReactElement;

	expect(mark.type).toBe(Badge);
	expect(mark.props).toEqual({
		tone: "accent",
		size: "sm",
		children: "Current",
	});
});

test("a later open wave has no Current badge", () => {
	const laterWave = {
		...wave,
		id: "wave-2",
		ref: "TRL/epic/wave-2",
		name: "Polish",
	} as WaveSummary;
	const laterGroup = {
		...group,
		key: laterWave.id,
		label: laterWave.name,
		wave: { id: laterWave.id, ref: laterWave.ref, name: laterWave.name },
	} as TableGroup;
	const parts = waveHeaderParts(laterGroup, {
		editing: { waves: [wave, laterWave], canMove: () => true } as unknown as WaveEditing,
		project: "TRL",
		onAddTicket: () => {},
		onNewTicket: () => {},
	});

	expect(parts?.mark).toBeUndefined();
});

test("No wave gets no rename, reorder, or delete controls", () => {
	const { parts } = fixture();
	const noWave = { ...group, key: "none", wave: undefined };

	expect(
		waveHeaderParts(noWave, {
			editing: { waves: [wave] } as unknown as WaveEditing,
			project: "TRL",
			onAddTicket: () => {},
			onNewTicket: () => {},
		}),
	).toBeUndefined();
	expect(parts.actions).toBeDefined();
});
