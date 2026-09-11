import { useQuery } from "@tanstack/react-query";
import { useApp } from "../../../../../../../lib/appContext";
import { diffUrl } from "../../../../../utils/diffUrl";

export type DiffLinkProps = {
	url: string;
};

// The control that opens the diff of the pull request. `diffUrlTemplate` in
// the settings names the viewer, so a viewer on this machine draws the diff
// and trellis renders none of its own. The root route loads the settings,
// so the read here answers from the cache.
export function DiffLink({ url }: DiffLinkProps) {
	const { orpc } = useApp();
	const settings = useQuery(orpc.settings.get.queryOptions({})).data;
	if (settings === undefined) return null;

	return (
		<a
			href={diffUrl(settings.diffUrlTemplate, url)}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover ease-out hover:border-border-strong hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:h-11"
		>
			Show diff
		</a>
	);
}
