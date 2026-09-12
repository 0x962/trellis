import { Archive, DownloadSimple, File, FileText, FileXls } from "@phosphor-icons/react";
import type { Attachment } from "@trellis/api";
import { ActorChip } from "@trellis/ui";
import type { ReactElement } from "react";
import { relativeTime } from "../../../../../lib/format";
import { formatBytes } from "../../../utils/formatBytes";
import { AttachmentActions } from "../AttachmentActions";

export type AttachmentRowProps = {
	attachment: Attachment;
	onDelete?: () => Promise<void>;
	onRename?: (name: string) => Promise<void>;
};

const fileIcon = (attachment: Attachment): { name: string; icon: ReactElement } => {
	if (attachment.mime.startsWith("text/")) return { name: "document", icon: <FileText /> };
	if (attachment.mime.includes("spreadsheet")) return { name: "table", icon: <FileXls /> };
	if (attachment.mime.includes("zip")) return { name: "archive", icon: <Archive /> };
	return { name: "file", icon: <File /> };
};

// One file that is not an image: the type icon, the name, the size, the
// actor, the time, a download link, and the row menu.
export function AttachmentRow({ attachment, onDelete, onRename }: AttachmentRowProps) {
	const type = fileIcon(attachment);
	return (
		<div
			data-attachment-row=""
			className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3"
		>
			<span
				data-file-icon={type.name}
				aria-hidden="true"
				className="inline-flex size-4 shrink-0 text-fg-muted *:size-full"
			>
				{type.icon}
			</span>
			<span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{attachment.filename}</span>
			<span className="text-sm text-fg-muted tabular">{formatBytes(attachment.size)}</span>
			{attachment.actor.kind !== "system" && <ActorChip name={attachment.actor.name} kind={attachment.actor.kind} />}
			<time dateTime={attachment.createdAt} className="text-sm text-fg-muted tabular">
				{relativeTime(attachment.createdAt)}
			</time>
			<a
				href={attachment.url}
				download={attachment.filename}
				aria-label={`Download ${attachment.filename}`}
				className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted transition duration-hover ease-out hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
			>
				<DownloadSimple aria-hidden="true" className="size-3.5" />
			</a>
			{onDelete !== undefined && onRename !== undefined && (
				<AttachmentActions attachment={attachment} onDelete={onDelete} onRename={onRename} />
			)}
		</div>
	);
}
