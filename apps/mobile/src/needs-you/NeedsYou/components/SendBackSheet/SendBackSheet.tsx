import type { ReactElement } from "react";

export type SendBackSheetProps = {
	identifier: string;
	visible: boolean;
	onCancel: () => void;
	// The comment text. The sheet enables Send back once the text holds a character.
	onSubmit: (comment: string) => void;
};

export function SendBackSheet(_props: SendBackSheetProps): ReactElement {
	throw new Error("mobile-inbox: SendBackSheet is not implemented");
}
