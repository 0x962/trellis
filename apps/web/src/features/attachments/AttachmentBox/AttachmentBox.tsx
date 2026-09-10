import { Button } from "@trellis/ui";
import { Paperclip, Plus } from "lucide-react";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { type Uploads, useUploads } from "../hooks/useUploads";
import { UploadProgress } from "../UploadProgress";

export type AttachmentBoxProps = {
	// The ticket a picked file attaches to: CDE-42.
	ticket: string;
	// The uploads of the surface that owns the section. With them, the
	// surface draws the upload progress, so the box draws only its control.
	uploads?: Uploads;
	// A quiet 28 px Upload button for a section header. Without it, the box
	// is the 96 px dashed tile that ends the thumbnail grid.
	compact?: boolean;
};

const tileClass =
	"flex size-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-border-strong text-fg-faint transition-colors duration-hover ease-out hover:border-accent hover:text-fg data-[over=true]:border-accent data-[over=true]:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

type ViewProps = { uploads: Uploads; showProgress: boolean; compact: boolean };

// The control that picks files and takes a drop. Both presentations carry
// `data-attachment-box`, so a drop on either one uploads the files.
function AttachmentBoxView({ uploads, showProgress, compact }: ViewProps) {
	const picker = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const { uploads: entries, start, dismiss } = uploads;

	const choose = () => picker.current!.click();
	const selected = (event: ChangeEvent<HTMLInputElement>) => {
		start([...event.target.files!]);
		event.target.value = "";
	};
	const dragOver = (event: DragEvent<HTMLButtonElement>) => {
		if (!event.dataTransfer.types.includes("Files")) return;
		event.preventDefault();
		event.stopPropagation();
		setOver(true);
	};
	const drop = (event: DragEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setOver(false);
		start([...event.dataTransfer.files]);
	};
	const dragLeave = (event: DragEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		setOver(false);
	};
	const handlers = { onClick: choose, onDragOver: dragOver, onDragLeave: dragLeave, onDrop: drop };

	const control = compact ? (
		<Button
			variant="quiet"
			size="sm"
			icon={<Paperclip />}
			data-attachment-box=""
			data-over={String(over)}
			{...handlers}
		>
			Upload
		</Button>
	) : (
		<button type="button" data-attachment-box="" data-over={String(over)} className={tileClass} {...handlers}>
			<Plus aria-hidden="true" className="size-4" />
			<span className="sr-only">Drop files or click to upload</span>
		</button>
	);

	return (
		<>
			<input ref={picker} type="file" multiple className="hidden" onChange={selected} />
			{control}
			{showProgress &&
				entries.map((upload) => <UploadProgress key={upload.id} upload={upload} showName onDismiss={dismiss} />)}
		</>
	);
}

function OwnedAttachmentBox({ ticket, compact }: { ticket: string; compact: boolean }) {
	const uploads = useUploads(ticket, false);
	return <AttachmentBoxView uploads={uploads} showProgress compact={compact} />;
}

// The file picker and drop control of the attachments section.
export function AttachmentBox({ ticket, uploads, compact = false }: AttachmentBoxProps) {
	return uploads === undefined ? (
		<OwnedAttachmentBox ticket={ticket} compact={compact} />
	) : (
		<AttachmentBoxView uploads={uploads} showProgress={false} compact={compact} />
	);
}
