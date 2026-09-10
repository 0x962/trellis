import { Button, EmptyState } from "@trellis/ui";
import { errorMessage } from "../../../../../lib/conflict";

export type TableErrorProps = {
	// The failure of the first page of active rows.
	error: unknown;
	onRetry: () => void;
};

// The table's state when the active rows fail to load. It shows the
// server's message and a Retry in place of the rows, so a failed load never
// reads as a project with no open work.
export function TableError({ error, onRetry }: TableErrorProps) {
	return (
		<EmptyState
			title="The tickets did not load."
			description={errorMessage(error)}
			variant="page"
			action={
				<Button size="md" onClick={onRetry}>
					Retry
				</Button>
			}
		/>
	);
}
