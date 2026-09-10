import { marginUrl } from "../../../../../utils/marginUrl";

export type OpenInMarginProps = {
	url: string;
};

// The control that opens the pull request in margin. margin draws the diff,
// the checks, and the local review comments on this machine, so trellis
// renders no diff of its own.
export function OpenInMargin({ url }: OpenInMarginProps) {
	return (
		<a
			href={marginUrl(url)}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover ease-out hover:border-border-strong hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:h-11"
		>
			Show diff
		</a>
	);
}
