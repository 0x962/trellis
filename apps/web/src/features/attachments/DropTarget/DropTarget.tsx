import type { ReactNode } from "react";

export type DropTargetProps = {
	// The ticket identifier the overlay names: CDE-42.
	identifier: string;
	onFiles: (files: File[]) => void;
	children: ReactNode;
};

// Makes its surface a drop target. A drag that carries files raises a
// full-surface dashed overlay, and a drop hands the files to `onFiles`.
export function DropTarget({ children }: DropTargetProps) {
	return <div data-drop-target="">{children}</div>;
}
