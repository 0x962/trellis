import { Link } from "@tanstack/react-router";
import { FailureState } from "@trellis/ui";
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
		<FailureState
			variant="page"
			className="page-card"
			title={`${ref} does not exist`}
			description="The URL may hold a typo. A ticket or a project that somebody deleted shows this page too."
			action={
				searchFor === undefined ? (
					<Link to="/needs-you" className={linkButtonClass}>
						Needs you
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
