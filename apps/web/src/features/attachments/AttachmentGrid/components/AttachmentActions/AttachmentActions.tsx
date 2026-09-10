import type { Attachment } from "@trellis/api";
import { IconButton, Input, Menu } from "@trellis/ui";
import { MoreHorizontal } from "lucide-react";
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
			setRenaming(false);
			trigger.current!.focus();
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
						icon={<MoreHorizontal />}
						className={triggerClassName}
					/>
				}
				items={[
					{
						label: "Copy markdown link",
						onSelect: () => void navigator.clipboard.writeText(attachmentMarkdown(attachment)),
					},
					{ label: "Rename", onSelect: () => setRenaming(true) },
					{ label: "Delete", danger: true, onSelect: () => void onDelete() },
				]}
			/>
		</div>
	);
}
