import { Button, FailureState } from "@trellis/ui";
import type { RefObject } from "react";

export function PickerFailure({
	title,
	error,
	pending,
	onRetry,
	input,
}: {
	title: string;
	error: Error | null;
	pending: boolean;
	onRetry: () => Promise<unknown>;
	input: RefObject<HTMLInputElement | null>;
}) {
	if (!error) return null;
	return (
		<FailureState
			variant="section"
			className="p-3"
			title={title}
			detail={error.message}
			action={
				<Button
					size="md"
					processing={pending}
					onClick={async () => {
						await onRetry();
						input.current?.focus({ preventScroll: true });
					}}
				>
					Retry
				</Button>
			}
		/>
	);
}
