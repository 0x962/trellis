import { Link } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { SearchX } from "lucide-react";

export type NotFoundStateProps = {
	// The ref the URL named: `CDE-999`, `CDE.web.auth`.
	ref: string;
	// A search for the ref, offered under the message.
	searchFor?: string;
};

const linkClass =
	"inline-flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover hover:bg-bg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

// What a page shows when its URL names a ticket or a project that does not
// exist.
export function NotFoundState({ ref, searchFor }: NotFoundStateProps) {
	return (
		<EmptyState
			icon={<SearchX />}
			title={`${ref} doesn't exist`}
			description="It may have been deleted, or the URL may hold a typo."
			action={
				searchFor === undefined ? (
					<Link to="/all" className={linkClass}>
						All tickets
					</Link>
				) : (
					<Link to="/search" search={{ q: searchFor }} className={linkClass}>
						Search for {searchFor}
					</Link>
				)
			}
			className="flex-1 justify-center"
		/>
	);
}
