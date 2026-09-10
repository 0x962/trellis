import type { Priority } from "@trellis/api";
import type { ReactElement } from "react";

export type PrioritySheetProps = {
	open: boolean;
	current: Priority;
	onChoose: (priority: Priority) => void;
	onClose: () => void;
};

// The bottom sheet under `testID="priority-sheet"`: one radio per priority,
// Urgent to None, named Urgent, High, Medium, Low, None.
export function PrioritySheet(_props: PrioritySheetProps): ReactElement | null {
	throw new Error("PrioritySheet is not implemented");
}
