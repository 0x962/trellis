import { Link, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { linkButtonClass } from "../linkButtonClass";

export function PageNotFound() {
	const pathname = useRouterState({ select: (state) => (state.resolvedLocation ?? state.location).pathname });
	return (
		<EmptyState
			key={pathname}
			variant="page"
			className="page-card"
			title="Page not found"
			description="No page has this URL."
			action={
				<Link to="/search" className={linkButtonClass}>
					Search
				</Link>
			}
		/>
	);
}
