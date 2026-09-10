import type { Attachment, Ticket } from "@trellis/api";
import { Avatar } from "@trellis/ui";
import { Download, FileText } from "lucide-react";
import { compactRelativeTime } from "../../../lib/format";
import { formatBytes } from "./utils/formatBytes";

export type AttachmentsProps = {
	ticket: Ticket;
};

const isImage = (attachment: Attachment) => attachment.mime.startsWith("image/");

// The files on a ticket: images as 96 px thumbnails, the rest as rows with
// the name, the size, who uploaded it, when, and a download link. The
// dashed box is the upload target; the upload itself lands in M5.
export function Attachments({ ticket }: AttachmentsProps) {
	const images = ticket.attachments.filter(isImage);
	const files = ticket.attachments.filter((attachment) => !isImage(attachment));
	return (
		<section aria-label="Attachments" className="flex flex-col gap-2">
			<header className="flex h-7 items-center gap-2 text-base font-medium text-fg">
				Attachments
				<span className="font-normal text-fg-faint tabular">{ticket.attachments.length}</span>
			</header>
			<div className="flex flex-wrap gap-2">
				{images.map((image) => (
					<a
						key={image.id}
						href={image.url}
						target="_blank"
						rel="noopener noreferrer"
						title={image.filename}
						className="block shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
					>
						<img
							src={image.url}
							alt={image.filename}
							className="size-24 rounded-md border border-border object-cover"
						/>
					</a>
				))}
				<div className="flex min-h-24 min-w-48 flex-1 items-center justify-center rounded-md border border-dashed border-border-strong px-4 text-center text-sm text-fg-faint">
					Drop files or click to upload
				</div>
			</div>
			{files.length > 0 && (
				<ul className="flex flex-col">
					{files.map((file) => (
						<li
							key={file.id}
							aria-label={file.filename}
							className="flex h-9 items-center gap-3 border-b border-border text-base text-fg last:border-b-0"
						>
							<FileText className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
							<span className="min-w-0 flex-1 truncate">{file.filename}</span>
							<span className="shrink-0 text-sm text-fg-faint tabular">{formatBytes(file.size)}</span>
							{file.actor.kind !== "system" && <Avatar kind={file.actor.kind} name={file.actor.name} />}
							<time dateTime={file.createdAt} className="w-8 shrink-0 text-right text-sm text-fg-faint tabular">
								{compactRelativeTime(file.createdAt)}
							</time>
							<a
								href={file.url}
								download={file.filename}
								className="inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
								aria-label={`Download ${file.filename}`}
							>
								<Download className="size-3.5" aria-hidden="true" />
							</a>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
