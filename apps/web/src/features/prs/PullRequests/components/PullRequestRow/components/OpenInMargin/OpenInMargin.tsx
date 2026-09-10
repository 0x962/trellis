export type OpenInMarginProps = {
	url: string;
};

// The control that opens the pull request in margin. margin draws the diff,
// the checks, and the local review comments on this machine, so trellis
// renders no diff of its own.
export function OpenInMargin(_props: OpenInMarginProps) {
	return null;
}
