import type { LinkedPullRequest } from "@trellis/api";
import type { ReactElement } from "react";

export type PrCardProps = {
	pr: LinkedPullRequest;
};

// One linked pull request: the state, the repository and the number, the
// title, the branch pair, the check ribbon, the count pill, and the review
// chip. A tap opens the pull request in the system browser.
export function PrCard(_props: PrCardProps): ReactElement {
	throw new Error("PrCard is not implemented");
}
