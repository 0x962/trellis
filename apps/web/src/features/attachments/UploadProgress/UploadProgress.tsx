import { Button } from "@trellis/ui";
import type { Upload } from "../hooks/useUploads";
import { uploadErrorText } from "../utils/uploadErrorText";

export type UploadProgressProps = {
	upload: Upload;
	showName?: boolean;
	// Takes a failed upload off the list.
	onDismiss: (id: string) => void;
	onRetry?: (id: string) => void;
};

// One upload: a determinate bar while it runs, or an inline message after a
// failed upload.
export function UploadProgress({ upload, showName = true, onDismiss, onRetry }: UploadProgressProps) {
	if (upload.error !== null) {
		return (
			<div
				role="alert"
				className="flex h-10 items-center gap-3 rounded-md border border-danger bg-danger-soft px-3 text-sm text-danger"
			>
				<span className="min-w-0 flex-1 truncate">{uploadErrorText(upload.name, upload.error)}</span>
				{upload.error.code === "UPLOAD_FAILED" && onRetry !== undefined && (
					<Button size="sm" variant="quiet" onClick={() => onRetry(upload.id)}>
						Retry
					</Button>
				)}
				<Button size="sm" variant="quiet" onClick={() => onDismiss(upload.id)}>
					Dismiss
				</Button>
			</div>
		);
	}
	if (upload.status === "pending") {
		return (
			<div className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3">
				<span className="min-w-0 flex-1 truncate text-sm text-fg">{upload.name}</span>
				<Button size="sm" variant="quiet" onClick={() => onDismiss(upload.id)}>
					Remove
				</Button>
			</div>
		);
	}

	return (
		<div className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3">
			<span className="min-w-0 flex-1 truncate text-sm text-fg">{showName ? upload.name : "Uploading file"}</span>
			<progress
				className="h-1 w-24 accent-accent"
				value={upload.percent}
				max={100}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={upload.percent}
				aria-label={`Upload progress for ${upload.name}`}
			/>
		</div>
	);
}
