import { ArrowDown, ArrowUp, Trash } from "@phosphor-icons/react";
import { WAVE_NAME_MAX, type WaveSummary } from "@trellis/api";
import { IconButton, Input, Tooltip } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";

export type WaveRowProps = {
	wave: WaveSummary;
	first: boolean;
	last: boolean;
	// The place of the wave in the list, from 0.
	index: number;
	// True while a wave write is in flight. The row then takes no
	// action. Its controls keep the focus, because a control that becomes
	// `disabled` loses the focus to the document body.
	busy: boolean;
	// Set on the row that the person moved last: the direction of that move.
	// When the list lands in the new order, the row puts the focus back on
	// the button of that direction and calls `onFocusRestored`.
	focusStep?: -1 | 1;
	onFocusRestored: () => void;
	onRename: (name: string) => void;
	// Moves the wave one place: -1 is up, 1 is down.
	onMove: (step: -1 | 1) => void;
	onDelete: () => void;
};

// One wave in the Edit epic sheet: the name field, move up, move
// down, and delete. The name saves when the field loses focus or on Enter,
// and only when the person changed the text and the trimmed text differs
// from the stored name. An empty field takes the stored name back. A rename
// from another client replaces the text of a field that the person did not
// change.
export function WaveRow({
	wave,
	index,
	first,
	last,
	busy,
	focusStep,
	onFocusRestored,
	onRename,
	onMove,
	onDelete,
}: WaveRowProps) {
	const [name, setName] = useState(wave.name);
	const edited = useRef(false);
	const up = useRef<HTMLButtonElement>(null);
	const down = useRef<HTMLButtonElement>(null);
	const shownIndex = useRef(index);

	useEffect(() => {
		if (!edited.current) setName(wave.name);
	}, [wave.name]);

	// React moves the DOM node of a row when the order changes, and a moved
	// node loses the focus. At the end of the list the button of the move
	// direction is disabled, so the other button takes the focus.
	useEffect(() => {
		const moved = shownIndex.current !== index;
		shownIndex.current = index;
		if (!moved || focusStep === undefined) return;
		const target = focusStep === -1 ? (first ? down : up) : last ? up : down;
		target.current?.focus();
		onFocusRestored();
	}, [index, first, last, focusStep, onFocusRestored]);

	const commit = () => {
		const next = name.trim();
		const changed = edited.current;
		edited.current = false;
		if (next === "" || !changed) setName(wave.name);
		else if (next !== wave.name) onRename(next);
	};

	return (
		<li className="flex items-end gap-1">
			<div className="min-w-0 flex-1">
				<Input
					label={`Name of ${wave.name}`}
					hideLabel
					autoComplete="off"
					maxLength={WAVE_NAME_MAX}
					readOnly={busy}
					value={name}
					onChange={(event) => {
						edited.current = true;
						setName(event.target.value);
					}}
					onBlur={commit}
					onKeyDown={(event) => {
						// Enter saves the name. Without this, Enter submits the epic form around the row.
						if (event.key !== "Enter") return;
						event.preventDefault();
						commit();
					}}
					className="pointer-coarse:h-11"
				/>
			</div>
			<Tooltip content="Move up">
				<IconButton
					label={`Move ${wave.name} up`}
					icon={<ArrowUp />}
					size="md"
					ref={up}
					focusableWhenDisabled
					disabled={busy || first}
					onClick={() => onMove(-1)}
				/>
			</Tooltip>
			<Tooltip content="Move down">
				<IconButton
					label={`Move ${wave.name} down`}
					icon={<ArrowDown />}
					size="md"
					ref={down}
					focusableWhenDisabled
					disabled={busy || last}
					onClick={() => onMove(1)}
				/>
			</Tooltip>
			<Tooltip content="Delete wave">
				<IconButton
					label={`Delete ${wave.name}`}
					icon={<Trash />}
					size="md"
					focusableWhenDisabled
					disabled={busy}
					onClick={onDelete}
				/>
			</Tooltip>
		</li>
	);
}
