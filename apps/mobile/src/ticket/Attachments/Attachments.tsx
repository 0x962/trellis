import type { Attachment } from "@trellis/api";
import type { ReactElement } from "react";

export type AttachmentsProps = {
	attachments: readonly Attachment[];
	// The stored server URL, which the relative attachment paths join.
	serverUrl: string;
};

// An inline image renders with expo-image under `testID="attachment-image"`.
// Every other file is a button named by its filename that opens the URL
// in the system browser.
export function Attachments(_props: AttachmentsProps): ReactElement | null {
	throw new Error("Attachments is not implemented");
}
