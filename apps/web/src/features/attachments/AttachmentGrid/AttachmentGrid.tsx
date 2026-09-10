import { useQuery } from "@tanstack/react-query";
import type { Attachment } from "@trellis/api";
import { Dialog } from "@trellis/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AttachmentBox } from "../AttachmentBox";
import { DropTarget } from "../DropTarget";
import { useUploads } from "../hooks/useUploads";
import { isThumbnailImage } from "../utils/isThumbnailImage";
import { AttachmentActions } from "./components/AttachmentActions";
import { AttachmentRow } from "./components/AttachmentRow";

export type AttachmentGridProps = {
	// The ticket whose attachments the section shows: CDE-42.
	ticket: string;
};

// The attachments section of a ticket surface: the drop target, the drop
// box, the uploads in flight, the image thumbnails, and the file rows.
export function AttachmentGrid({ ticket }: AttachmentGridProps) {
	const { client, orpc, queryClient, scheduler } = useApp();
	const list = useQuery(orpc.attachments.list.queryOptions({ input: { ticket } })).data;
	const uploadManager = useUploads(ticket);
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
	return (
		<DropTarget identifier={ticket} onFiles={uploadManager.start}>
			<div data-attachments="" className="mt-8 flex flex-col gap-3">
				<h2 className="text-sm font-medium text-fg-muted tabular">Attachments · {list.length}</h2>
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
				<AttachmentBox ticket={ticket} uploads={uploadManager} />
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
		</DropTarget>
	);
}
