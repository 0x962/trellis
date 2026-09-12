import { Link } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { linkButtonClass } from "../linkButtonClass";

export type NotFoundStateProps = {
	// The ref the URL named: `CDE-999`, `CDE.web.auth`.
	ref: string;
	// A search for the ref, offered under the message.
	searchFor?: string;
};

// What a page shows when its URL names a ticket or a project that does not
// exist.
export function NotFoundState({ ref, searchFor }: NotFoundStateProps) {
	return (
		<EmptyState
			variant="page"
			title={`${ref} does not exist`}
			description="Make sure that the URL has no typo. This page also shows for a deleted ticket or project."
			action={
				searchFor === undefined ? (
					<Link to="/all" className={linkButtonClass}>
						All tickets
					</Link>
				) : (
					<Link to="/search" search={{ q: searchFor }} className={linkButtonClass}>
						Search for {searchFor}
					</Link>
				)
			}
		/>
	);
}
