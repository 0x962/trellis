import { Button, Skeleton } from "@trellis/ui";

export type ProjectListStatusProps = {
	// True after a request for the list failed. False while the first
	// request still runs.
	failed: boolean;
	onRetry: () => void;
};

// What the Projects section shows before the project list arrives. The
// first request draws three placeholder rows. A failed request draws a line
// that says so, with a Retry button, while the query keeps its own retries.
export function ProjectListStatus({ failed, onRetry }: ProjectListStatusProps) {
	if (!failed) return <Skeleton lines={3} width="w-32" className="px-2 py-2.5" />;
	return (
		<div role="status" className="flex h-8 items-center justify-between gap-2 pl-2 text-sm text-fg-muted">
			<span className="truncate">Could not load projects</span>
			<Button variant="quiet" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}
