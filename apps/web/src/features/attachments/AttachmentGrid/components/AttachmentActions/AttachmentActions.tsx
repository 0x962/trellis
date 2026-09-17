import { DotsThree } from "@phosphor-icons/react";
import type { Attachment } from "@trellis/api";
import { ConfirmDialog, IconButton, Input, Menu } from "@trellis/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { attachmentMarkdown } from "../../../utils/attachmentMarkdown";

export type AttachmentActionsProps = {
	attachment: Attachment;
	onDelete: () => Promise<void>;
	onRename: (name: string) => Promise<void>;
	triggerClassName?: string;
};

export function AttachmentActions({ attachment, onDelete, onRename, triggerClassName }: AttachmentActionsProps) {
	const trigger = useRef<HTMLButtonElement>(null);
	const field = useRef<HTMLInputElement>(null);
	const [renaming, setRenaming] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [name, setName] = useState(attachment.filename);

	useEffect(() => {
		if (!renaming) return;
		field.current!.focus();
		field.current!.select();
	}, [renaming]);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			setRenaming(false);
			trigger.current!.focus();
			return;
		}
		if (event.key !== "Enter") return;
		event.preventDefault();
		void (async () => {
			await onRename(name);
			// A rename deletes this attachment, so its row can unmount before
			// `onRename` resolves. The trigger is then gone and takes no focus.
			setRenaming(false);
			trigger.current?.focus();
		})();
	};

	return (
		<div className="flex min-w-0 items-center gap-1">
			{renaming && (
				<Input
					ref={field}
					label={`Rename ${attachment.filename}`}
					hideLabel
					value={name}
					onChange={(event) => setName(event.target.value)}
					onKeyDown={onKeyDown}
				/>
			)}
			<Menu
				label={`Actions for ${attachment.filename}`}
				trigger={
					<IconButton
						ref={trigger}
						label={`Actions for ${attachment.filename}`}
						icon={<DotsThree />}
						className={triggerClassName}
					/>
				}
				items={[
					{
						label: "Copy markdown link",
						onSelect: () => void navigator.clipboard.writeText(attachmentMarkdown(attachment)),
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
