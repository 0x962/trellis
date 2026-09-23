import { DotsThree } from "@phosphor-icons/react";
import type { Attachment } from "@trellis/api";
import { ConfirmDialog, IconButton, Menu, writeClipboard } from "@trellis/ui";
import { useState } from "react";
import { attachmentMarkdown } from "../../../utils/attachmentMarkdown";

export type AttachmentActionsProps = {
	attachment: Attachment;
	onDelete: () => Promise<void>;
	// Opens the rename field. The field itself sits on the file name, which is
	// somewhere else on the screen, so the surface owns it.
	onRename: () => void;
	triggerClassName?: string;
};

export function AttachmentActions({ attachment, onDelete, onRename, triggerClassName }: AttachmentActionsProps) {
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex min-w-0 items-center gap-1">
			<Menu
				label={`Actions for ${attachment.filename}`}
				trigger={
					<IconButton label={`Actions for ${attachment.filename}`} icon={<DotsThree />} className={triggerClassName} />
				}
				items={[
					{
						label: "Copy markdown link",
						onSelect: () => void writeClipboard(attachmentMarkdown(attachment)),
					},
					{ label: "Rename", onSelect: onRename },
					{ label: "Delete", danger: true, onSelect: () => setConfirming(true) },
				]}
			/>
			<ConfirmDialog
				open={confirming}
				title={`Delete ${attachment.filename}?`}
				description="trellis cannot restore a deleted file."
				confirmLabel="Delete"
				danger
				onConfirm={() => {
					setConfirming(false);
					void onDelete();
				}}
				onCancel={() => setConfirming(false)}
			/>
		</div>
	);
}
