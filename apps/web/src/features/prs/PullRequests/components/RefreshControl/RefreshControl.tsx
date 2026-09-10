import type { LinkedPullRequest } from "@trellis/api";

export type RefreshControlProps = {
	prs: readonly LinkedPullRequest[];
};

// The age of the newest fetch and the control that polls every listed pull
// request again.
export function RefreshControl(_props: RefreshControlProps) {
	return null;
}
