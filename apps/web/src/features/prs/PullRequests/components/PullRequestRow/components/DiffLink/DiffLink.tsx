import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { diffUrl } from "../../../../../utils/diffUrl";

export type DiffLinkProps = {
	url: string;
	children: ReactNode;
};

// The link that opens the diff of the pull request. `diffUrlTemplate` in the
// settings names the viewer, so a viewer on this machine draws the diff and
// trellis renders none of its own. The root route loads the settings, so the
// read here answers from the cache.
//
// `before:absolute before:inset-0` stretches an invisible layer over the
// nearest positioned ancestor, so a click anywhere on the card opens the
// diff. The card that holds this link must carry `relative`.
export function DiffLink({ url, children }: DiffLinkProps) {
	const { orpc } = useApp();
	const settings = useQuery(orpc.settings.get.queryOptions({})).data;
	const text = "min-w-0 truncate text-base font-medium text-fg";
	if (settings === undefined) return <span className={text}>{children}</span>;

	return (
		<a
			href={diffUrl(settings.diffUrlTemplate, url)}
			target="_blank"
			rel="noopener noreferrer"
			className={`${text} before:absolute before:inset-0 before:rounded-md hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`}
		>
			{children}
		</a>
	);
}
