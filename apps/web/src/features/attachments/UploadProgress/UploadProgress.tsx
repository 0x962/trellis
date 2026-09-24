import { ArrowClockwise, X } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import type { Upload } from "../hooks/useUploads";
import { uploadErrorText } from "../utils/uploadErrorText";

export type UploadProgressProps = {
	upload: Upload;
	showName?: boolean;
	// Removes one upload from the list.
	onDismiss: (id: string) => void;
	onRetry?: (id: string) => void;
};

// One row of the attachment list. A file that waits for a ticket stays
// removable, a failed file shows its message, and a running file shows a bar.
// Each action is a round icon button with a tooltip, the shape that every
// other row of the app gives an action.
export function UploadProgress({ upload, showName = true, onDismiss, onRetry }: UploadProgressProps) {
	const name = upload.file.name;
	if (upload.error !== null) {
		return (
			<div
				role="alert"
				className="flex h-10 items-center gap-3 rounded-md border border-danger bg-danger-soft px-3 text-sm text-danger"
			>
				<span className="min-w-0 flex-1 truncate">{uploadErrorText(name, upload.error)}</span>
				{upload.error.code === "UPLOAD_FAILED" && onRetry !== undefined && (
					<Tooltip content="Retry">
						<IconButton
							size="sm"
							variant="quiet"
							label={`Retry ${name}`}
							icon={<ArrowClockwise />}
							onClick={() => onRetry(upload.id)}
						/>
					</Tooltip>
				)}
				<Tooltip content="Dismiss">
					<IconButton
						size="sm"
						variant="quiet"
						label={`Dismiss ${name}`}
						icon={<X />}
						onClick={() => onDismiss(upload.id)}
					/>
				</Tooltip>
			</div>
		);
	}
	if (upload.status === "pending") {
		return (
			<div className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3">
				<span className="min-w-0 flex-1 truncate text-sm text-fg">{name}</span>
				<Tooltip content="Remove">
					<IconButton
						size="sm"
						variant="quiet"
						label={`Remove ${name}`}
						icon={<X />}
						onClick={() => onDismiss(upload.id)}
					/>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3">
			<span className="min-w-0 flex-1 truncate text-sm text-fg">{showName ? name : "Uploading file"}</span>
			<progress
				className="h-1 w-24 accent-accent"
				value={upload.percent}
				max={100}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={upload.percent}
				aria-label={`Upload progress for ${name}`}
			/>
		</div>
	);
}
