import type { LinkedPullRequest } from "@trellis/api";
import { Sheet } from "@trellis/ui";
import { useState } from "react";
import { MarginFrame } from "./components/MarginFrame";

export type MarginPeekProps = {
	pr: LinkedPullRequest;
};

// The sheet is as wide as the window allows, up to 1240 px. A diff needs
// the width, and margin lays its own page out inside whatever it gets.
const width = "min(1240px, 100%)";

// The Show diff control, and the sheet it opens. The sheet frames margin's
// review of the pull request, so the diff, the checks, and the review
// comments stay beside the ticket and take no second tab.
//
// The sheet is modal: a person who reads a diff acts on the diff alone. The
// frame belongs to margin's origin, so every key press inside it goes to
// margin and Escape never reaches trellis. The close button in the sheet
// header is the control that always closes the sheet.
export function MarginPeek({ pr }: MarginPeekProps) {
	const [open, setOpen] = useState(false);
	const label = `${pr.owner}/${pr.repo} #${pr.number}`;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-7 shrink-0 items-center rounded-md border border-border bg-surface px-2.5 text-sm font-medium text-fg transition duration-hover ease-out hover:border-border-strong hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 pointer-coarse:h-11"
			>
				Show diff
			</button>
			<Sheet open={open} onOpenChange={setOpen} title={label} width={width}>
				<MarginFrame url={pr.url} label={label} />
			</Sheet>
		</>
	);
}
