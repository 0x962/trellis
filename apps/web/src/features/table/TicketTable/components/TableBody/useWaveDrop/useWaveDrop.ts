import type { VirtualItem } from "@tanstack/react-virtual";
import { type DragEvent, useRef, useState } from "react";
import type { TableGroup, TableItem } from "../../../../utils/flattenGroups";
import { draggedIds, dropGroup, groupSpan } from "../../../../utils/waveDrop";

export type WaveDrop = {
	// The key of the group under the pointer that takes the drop, or null.
	dropKey: string | null;
	// The offset and the height of the outline around that group, or null.
	frame: { top: number; height: number } | null;
	handlers: {
		onDragStart: (event: DragEvent<HTMLElement>) => void;
		onDragOver: (event: DragEvent<HTMLElement>) => void;
		onDragLeave: (event: DragEvent<HTMLElement>) => void;
		onDrop: (event: DragEvent<HTMLElement>) => void;
		onDragEnd: () => void;
	};
};

// Drags ticket rows into the wave groups of a table of one epic. A row
// drags through the link that covers it, and a selected row drags the whole
// selection. `lines` holds the offset and the height of every line of the
// virtual body, so a drag over any line of a group, its header, a row, an
// agent line or the empty line, targets that group.
export function useWaveDrop(
	items: readonly TableItem[],
	selected: readonly string[],
	lines: readonly VirtualItem[],
	onDrop: (ticketIds: string[], group: TableGroup) => void,
): WaveDrop {
	const dragged = useRef<string[] | null>(null);
	const [dropKey, setDropKey] = useState<string | null>(null);

	const targetOf = (event: DragEvent<HTMLElement>) => {
		const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
		const key = items[lines.findIndex((line) => y >= line.start && y < line.end)]?.group.key;
		return dragged.current === null || key === undefined ? null : dropGroup(items, key, dragged.current);
	};

	const end = () => {
		dragged.current = null;
		setDropKey(null);
	};

	const span = dropKey === null ? null : groupSpan(items, dropKey);
	const frame =
		span === null ? null : { top: lines[span.first]!.start, height: lines[span.last]!.end - lines[span.first]!.start };

	return {
		dropKey,
		frame,
		handlers: {
			onDragStart: (event) => {
				const row = (event.target as Element).closest<HTMLElement>('[role="row"][data-identifier]');
				const item = items.find((entry) => entry.kind === "row" && entry.ticket.identifier === row?.dataset.identifier);
				if (row === null || item?.kind !== "row" || item.group.epicRef === undefined) return;
				dragged.current = draggedIds(item.ticket.id, selected);
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", item.ticket.identifier);
				const box = row.getBoundingClientRect();
				event.dataTransfer.setDragImage(row, event.clientX - box.left, event.clientY - box.top);
			},
			onDragOver: (event) => {
				const group = targetOf(event);
				setDropKey(group?.key ?? null);
				if (group === null) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
			},
			onDragLeave: (event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropKey(null);
			},
			onDrop: (event) => {
				const group = targetOf(event);
				const ids = dragged.current;
				end();
				if (group === null || ids === null) return;
				event.preventDefault();
				onDrop(ids, group);
			},
			onDragEnd: end,
		},
	};
}
