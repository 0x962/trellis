import { Button, EmptyState } from "@trellis/ui";

export type TableErrorProps = {
	// The failure of the first page of active rows.
	error: unknown;
	onRetry: () => void;
};

// The table's state when the active rows fail to load. It shows a short
// Retry line in place of the rows, so a failed load never reads as no work.
export function TableError({ onRetry }: TableErrorProps) {
	return (
		<EmptyState
			title="Could not load tickets"
			variant="page"
			action={
				<Button size="md" onClick={onRetry}>
					Retry
				</Button>
			}
		/>
	);
}
