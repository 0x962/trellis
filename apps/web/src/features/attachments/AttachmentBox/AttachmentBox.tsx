import { Plus } from "@phosphor-icons/react";
import { Button } from "@trellis/ui";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { type Uploads, useUploads } from "../hooks/useUploads";
import { UploadProgress } from "../UploadProgress";

export type AttachmentBoxProps = {
	// The ticket a picked file attaches to: CDE-42.
	ticket: string;
	// The uploads of the surface that owns the section. With them, the
	// surface draws the upload progress, so the box draws only its control.
	uploads?: Uploads;
};

type ViewProps = { uploads: Uploads; showProgress: boolean };

// The control that picks files and takes a drop from the attachment header.
function AttachmentBoxView({ uploads, showProgress }: ViewProps) {
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

	const control = (
		<Button variant="quiet" size="sm" icon={<Plus />} data-attachment-box="" data-over={String(over)} {...handlers}>
			Add
		</Button>
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

function OwnedAttachmentBox({ ticket }: { ticket: string }) {
	const uploads = useUploads(ticket, false);
	return <AttachmentBoxView uploads={uploads} showProgress />;
}

// The file picker and drop control of the attachments section.
export function AttachmentBox({ ticket, uploads }: AttachmentBoxProps) {
	return uploads === undefined ? (
		<OwnedAttachmentBox ticket={ticket} />
	) : (
		<AttachmentBoxView uploads={uploads} showProgress={false} />
	);
}
