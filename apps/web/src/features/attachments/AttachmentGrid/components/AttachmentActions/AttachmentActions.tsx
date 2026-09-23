import { DotsThree } from "@phosphor-icons/react";
import type { Attachment } from "@trellis/api";
import { ConfirmDialog, IconButton, InlineEdit, Menu, writeClipboard } from "@trellis/ui";
import { useState } from "react";
import { attachmentMarkdown } from "../../../utils/attachmentMarkdown";

export type AttachmentActionsProps = {
	attachment: Attachment;
	onDelete: () => Promise<void>;
	onRename: (name: string) => Promise<void>;
	triggerClassName?: string;
};

export function AttachmentActions({ attachment, onDelete, onRename, triggerClassName }: AttachmentActionsProps) {
	const [renaming, setRenaming] = useState(false);
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex min-w-0 items-center gap-1">
			<InlineEdit
				label={`Rename ${attachment.filename}`}
				value={attachment.filename}
				editing={renaming}
				onEditingChange={setRenaming}
				onCommit={onRename}
				errorTitle={`${attachment.filename} kept its name.`}
			/>
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
					{ label: "Rename", onSelect: () => setRenaming(true) },
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
