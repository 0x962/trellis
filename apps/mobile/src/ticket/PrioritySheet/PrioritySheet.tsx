import type { Priority } from "@trellis/api";
import { PriorityIcon } from "../../components/PriorityIcon";
import { RadioRow } from "../../components/RadioRow";
import { Sheet } from "../../components/Sheet";
import { priorityLabels, priorityOrder } from "./priorities";

export type PrioritySheetProps = {
	open: boolean;
	current: Priority;
	onChoose: (priority: Priority) => void;
	onClose: () => void;
};

// The bottom sheet under `testID="priority-sheet"`: one radio per priority,
// Urgent to None, named Urgent, High, Medium, Low, None.
export function PrioritySheet({ open, current, onChoose, onClose }: PrioritySheetProps) {
	if (!open) return null;
	return (
		<Sheet title="Priority" testID="priority-sheet" onClose={onClose}>
			{priorityOrder.map((priority) => (
				<RadioRow
					key={priority}
					label={priorityLabels[priority]}
					checked={priority === current}
					icon={<PriorityIcon priority={priority} />}
					onPress={() => onChoose(priority)}
				/>
			))}
		</Sheet>
	);
}
