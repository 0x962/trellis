import { Button } from "@trellis/ui";

export type StalledActionsProps = {
	onMoveToTodo: () => void;
};

export function StalledActions({ onMoveToTodo }: StalledActionsProps) {
	return (
		<Button size="sm" variant="quiet" data-move-to-todo="" onClick={onMoveToTodo}>
			Move to Todo
		</Button>
	);
}
