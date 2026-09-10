import type { ReactElement } from "react";

export type ToastProps = {
	title: string;
	// The server message, under the title.
	detail?: string;
	// An error toast lives 6 s; a success toast lives 3 s.
	tone: "error" | "success";
	action?: { label: string; onPress: () => void };
	onDismiss: () => void;
};

export function Toast(_props: ToastProps): ReactElement {
	throw new Error("mobile-inbox: Toast is not implemented");
}
