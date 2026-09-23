import { ORPCError } from "@orpc/client";
import { Button, FailureState } from "@trellis/ui";
import type { ReactNode } from "react";
import { errorMessage } from "../../../../../lib/conflict";
import { NotFoundState } from "../../../../shell/NotFoundState";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar } from "../../../../shell/Topbar";

export type EpicLoadErrorProps = {
	// The epic ref from the URL, such as `OP/routine-runtime`.
	epicRef: string;
	slug: string;
	// The breadcrumb of the page title.
	parent: ReactNode;
	error: Error;
	onRetry: () => void;
};

// The epic page when the epic query fails: the not-found state for an epic
// that does not exist, and a retry for any other error.
export function EpicLoadError({ epicRef, slug, parent, error, onRetry }: EpicLoadErrorProps) {
	const notFound = error instanceof ORPCError && error.code === "NOT_FOUND";
	return (
		<>
			<Topbar>
				<PageTitle parent={parent} title={slug} />
			</Topbar>
			{notFound ? (
				<NotFoundState ref={epicRef} />
			) : (
				<FailureState
					variant="page"
					className="page-card"
					title={`${epicRef} did not load`}
					detail={errorMessage(error)}
					action={
						<Button size="md" onClick={onRetry}>
							Retry
						</Button>
					}
				/>
			)}
		</>
	);
}
