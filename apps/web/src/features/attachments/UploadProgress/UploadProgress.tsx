import type { Upload } from "../hooks/useUploads";

export type UploadProgressProps = {
	upload: Upload;
	// Takes a failed upload off the list.
	onDismiss: (id: string) => void;
};

// One upload: a determinate bar while it runs, an inline message when the
// server refuses it.
export function UploadProgress(_props: UploadProgressProps) {
	return null;
}
