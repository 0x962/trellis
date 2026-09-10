import type { ReactNode } from "react";
import { useDropTarget } from "../hooks/useDropTarget";

export type DropTargetProps = {
	// The ticket identifier the overlay names: CDE-42.
	identifier: string;
	onFiles: (files: File[]) => void;
	children: ReactNode;
};

// Makes its surface a drop target. A drag that carries files raises a
// full-surface dashed overlay, and a drop hands the files to `onFiles`.
export function DropTarget({ identifier, onFiles, children }: DropTargetProps) {
	const target = useDropTarget(onFiles);
	return (
		<section
			data-drop-target=""
			aria-label={`Attachments for ${identifier}`}
			className="relative"
			onDragOver={target.onDragOver}
			onDragLeave={target.onDragLeave}
			onDrop={target.onDrop}
		>
			{children}
			{target.over && (
				<div
					data-drop-overlay=""
					className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-accent-soft text-md font-medium text-accent"
				>
					Drop to attach to {identifier}
				</div>
			)}
		</section>
	);
}
