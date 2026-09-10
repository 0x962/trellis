import type { ReactElement } from "react";

export type ComposerProps = {
	// The identifier of the ticket the comment goes to.
	ticket: string;
};

// The plain text field "Add a comment" and the Send button at the bottom of
// the screen. Send is disabled while the field holds no text.
export function Composer(_props: ComposerProps): ReactElement {
	throw new Error("Composer is not implemented");
}
