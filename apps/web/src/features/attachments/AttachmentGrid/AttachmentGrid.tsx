import { useQuery } from "@tanstack/react-query";
import type { Attachment } from "@trellis/api";
import { Dialog, EmptyState, SectionHeader } from "@trellis/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AttachmentBox } from "../AttachmentBox";
import { DropTarget } from "../DropTarget";
import { type Uploads, useUploads } from "../hooks/useUploads";
import { UploadProgress } from "../UploadProgress";
import { isThumbnailImage } from "../utils/isThumbnailImage";
import { AttachmentActions } from "./components/AttachmentActions";
import { AttachmentRow } from "./components/AttachmentRow";

export type AttachmentGridProps = {
	// The ticket whose attachments the section shows: CDE-42.
	ticket: string;
	// The attachments a cached ticket detail already holds. With them, the
	// section paints at once while `attachments.list` loads.
	initialAttachments?: Attachment[];
	// The uploads of a surface that owns the drop target, such as the whole
	// ticket view. With them, the section draws no drop overlay of its own.
	uploads?: Uploads;
};

// The attachments section of a ticket surface: the header, the uploads in
// flight, the image thumbnails, and the file rows. Add stays in the header
// while the attachment list changes.
export function AttachmentGrid({ ticket, initialAttachments, uploads }: AttachmentGridProps) {
	const { client, orpc, queryClient, scheduler } = useApp();
	const list = useQuery({
		...orpc.attachments.list.queryOptions({ input: { ticket } }),
		initialData: initialAttachments,
	}).data;
	const ownUploads = useUploads(ticket);
	const uploadManager = uploads ?? ownUploads;
	const [active, setActive] = useState<number | null>(null);
	const focusTimers = useRef<unknown[]>([]);

	const attachments = list ?? [];
	const images = attachments.filter((attachment) => isThumbnailImage(attachment.mime));
	const files = attachments.filter((attachment) => !isThumbnailImage(attachment.mime));
	const shown = active === null ? null : images[active]!;
	const listKey = orpc.attachments.list.queryKey({ input: { ticket } });

	useLayoutEffect(() => {
		if (active === null) return;
		const walk = (event: globalThis.KeyboardEvent) => {
			if (event.key === "ArrowRight") {
				event.preventDefault();
				setActive((index) => Math.min(index! + 1, images.length - 1));
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				setActive((index) => Math.max(index! - 1, 0));
			}
		};
		document.addEventListener("keydown", walk, true);
		return () => document.removeEventListener("keydown", walk, true);
	}, [active, images.length]);
	useEffect(
		() => () => {
			for (const timer of focusTimers.current) scheduler.clearTimeout(timer);
		},
		[scheduler],
	);
	if (list === undefined) return null;

	const refresh = () => queryClient.invalidateQueries({ queryKey: listKey, refetchType: "all" });
	const remove = async (attachment: Attachment) => {
		await client.attachments.delete({ id: attachment.id });
		await refresh();
	};
	const rename = async (attachment: Attachment, name: string) => {
		const response = await fetch(attachment.url);
		const blob = await response.blob();
		const file = new File([blob], attachment.filename, { type: attachment.mime });
		await client.attachments.upload({ ticket, file, name });
		await client.attachments.delete({ id: attachment.id });
		await refresh();
	};
	const closeLightbox = () => {
		const id = shown!.id;
		setActive(null);
		focusTimers.current.push(
			scheduler.setTimeout(() => document.querySelector<HTMLElement>(`[data-thumbnail="${id}"]`)!.focus(), 200),
		);
	};
	const body = (
		<>
			<div data-attachments="" className="flex flex-col gap-2">
				<SectionHeader
					title="Attachments"
					count={list.length > 0 ? list.length : undefined}
					actions={<AttachmentBox ticket={ticket} uploads={uploadManager} />}
				/>
				{uploadManager.uploads.map((upload) => (
					<UploadProgress key={upload.id} upload={upload} showName={false} onDismiss={uploadManager.dismiss} />
				))}
				{attachments.length === 0 && uploadManager.uploads.length === 0 && (
					<EmptyState title="No attachments" description="Add a file or drop it anywhere on this ticket." />
				)}
				{images.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{images.map((attachment, index) => (
							<div key={attachment.id} className="relative size-24">
								<button
									type="button"
									data-thumbnail={attachment.id}
									aria-label="Open attachment preview"
									aria-describedby={`attachment-name-${attachment.id}`}
									className="size-24 overflow-hidden rounded-lg border border-border bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
									onClick={() => setActive(index)}
								>
									<img src={attachment.url} alt={attachment.filename} className="size-full object-cover" />
									<span id={`attachment-name-${attachment.id}`} className="sr-only">
										{attachment.filename}
									</span>
								</button>
								<div className="absolute top-1 right-1 rounded-md bg-elevated shadow-sm">
									<AttachmentActions
										attachment={attachment}
										onDelete={() => remove(attachment)}
										onRename={(name) => rename(attachment, name)}
										triggerClassName="h-24 max-h-7"
									/>
								</div>
							</div>
						))}
					</div>
				)}
				{files.map((attachment) => (
					<AttachmentRow
						key={attachment.id}
						attachment={attachment}
						onDelete={() => remove(attachment)}
						onRename={(name) => rename(attachment, name)}
					/>
				))}
			</div>
			{shown !== null && (
				<Dialog
					open
					title={shown.filename}
					onOpenChange={(open) => !open && closeLightbox()}
					className="w-auto max-w-full"
				>
					<div>
						<img src={shown.url} alt={shown.filename} className="max-h-screen max-w-full object-contain" />
					</div>
				</Dialog>
			)}
		</>
	);
	if (uploads !== undefined) {
		return (
			<section aria-label={`Attachments for ${ticket}`} className="relative">
				{body}
			</section>
		);
	}
	return (
		<DropTarget identifier={ticket} onFiles={uploadManager.start}>
			{body}
		</DropTarget>
	);
}
