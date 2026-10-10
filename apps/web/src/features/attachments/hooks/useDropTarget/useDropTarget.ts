import { type DragEvent, useState } from "react";

export type DropTargetHandlers = {
	over: boolean;
	onDragOver: (event: DragEvent<HTMLElement>) => void;
	onDragLeave: (event: DragEvent<HTMLElement>) => void;
	onDrop: (event: DragEvent<HTMLElement>) => void;
};

export const useDropTarget = (onFiles: (files: File[]) => void): DropTargetHandlers => {
	const [over, setOver] = useState(false);

	return {
		over,
		onDragOver: (event) => {
			if (!event.dataTransfer.types.includes("Files")) return;
			event.preventDefault();
			event.stopPropagation();
			setOver(true);
		},
		onDragLeave: () => setOver(false),
		onDrop: (event) => {
			if (!event.dataTransfer.types.includes("Files")) return;
			event.preventDefault();
			event.stopPropagation();
			setOver(false);
			onFiles([...event.dataTransfer.files]);
		},
	};
};
