import { type DragEvent, useState } from "react";

// Whether a drag carries files. A dragged text selection is not a drop.
const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");

// The drag handlers of a drop surface and whether a drop is over it. The
// upload itself lands in M5, so a drop closes the overlay and does nothing.
export const useDropOverlay = () => {
	const [over, setOver] = useState(false);
	return {
		over,
		handlers: {
			onDragEnter: (event: DragEvent) => {
				if (!carriesFiles(event)) return;
				event.preventDefault();
				setOver(true);
			},
			onDragOver: (event: DragEvent) => {
				if (!carriesFiles(event)) return;
				event.preventDefault();
			},
			onDragLeave: (event: DragEvent) => {
				if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
				setOver(false);
			},
			onDrop: (event: DragEvent) => {
				event.preventDefault();
				setOver(false);
			},
		},
	};
};

export type DropOverlayProps = {
	identifier: string;
};

// The full-surface dashed overlay while files hover over the ticket.
export function DropOverlay({ identifier }: DropOverlayProps) {
	return (
		<div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-accent-soft/80">
			<span className="rounded-lg border-2 border-dashed border-accent px-6 py-4 text-md font-medium text-fg">
				Drop to attach to {identifier}
			</span>
		</div>
	);
}
