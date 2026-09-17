import { ConfirmDialog } from "@trellis/ui";
import { confirmActions, useConfirmStore } from "../../../../../confirmStore";

// The one dialog every palette delete asks through. The palette closes
// before an action starts, so this dialog holds the screen alone. Its title
// is the question the action passed, such as "Delete CDE-42?".
export function DeleteConfirm() {
	const question = useConfirmStore((state) => state.question);
	const open = useConfirmStore((state) => state.open);
	return (
		<ConfirmDialog
			open={open}
			title={question}
			description="trellis cannot restore a deleted ticket. Its sub-tickets stay and lose their parent."
			confirmLabel="Delete"
			danger
			onConfirm={() => confirmActions.answer(true)}
			onCancel={() => confirmActions.answer(false)}
		/>
	);
}
