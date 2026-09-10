import { Button } from "@trellis/ui";
import { RotateCcw } from "lucide-react";

// An agent finished the ticket; a person puts it back in Todo.
export function ReopenButton({ onReopen }: { onReopen: () => void }) {
	return (
		<Button icon={<RotateCcw />} data-reopen="" onClick={onReopen}>
			Move to Todo
		</Button>
	);
}
