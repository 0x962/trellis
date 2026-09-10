import type { ReactElement } from "react";

export type DescriptionProps = {
	markdown: string;
	// True while an event named the description and the refetch is pending.
	// The old text stays and the hint "Text updating" shows.
	stale?: boolean;
};

// The description, rendered from markdown, read only. A task list item is a
// checkbox with its checked state.
export function Description(_props: DescriptionProps): ReactElement {
	throw new Error("Description is not implemented");
}
