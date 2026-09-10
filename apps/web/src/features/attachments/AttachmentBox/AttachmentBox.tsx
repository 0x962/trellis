import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { type Uploads, useUploads } from "../hooks/useUploads";
import { UploadProgress } from "../UploadProgress";

export type AttachmentBoxProps = {
	// The ticket a picked file attaches to: CDE-42.
	ticket: string;
	uploads?: Uploads;
};

// The explicit dashed drop box with its file picker.
function AttachmentBoxView({ uploads, showUploadNames }: { uploads: Uploads; showUploadNames: boolean }) {
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
	return (
		<div className="flex flex-col gap-2">
			<button
				type="button"
				data-attachment-box=""
				data-over={String(over)}
				className="flex h-24 w-full items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface text-sm text-fg-muted transition duration-hover ease-out hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				onClick={choose}
				onDragOver={dragOver}
				onDragLeave={(event) => {
					event.stopPropagation();
					setOver(false);
				}}
				onDrop={drop}
			>
				Drop files or click to upload
			</button>
			<input ref={picker} type="file" multiple className="hidden" onChange={selected} />
			{entries.map((upload) => (
				<UploadProgress key={upload.id} upload={upload} showName={showUploadNames} onDismiss={dismiss} />
			))}
		</div>
	);
}

function OwnedAttachmentBox({ ticket }: { ticket: string }) {
	const uploads = useUploads(ticket, false);
	return <AttachmentBoxView uploads={uploads} showUploadNames />;
}

// The explicit dashed drop box with its file picker.
export function AttachmentBox({ ticket, uploads }: AttachmentBoxProps) {
	return uploads === undefined ? (
		<OwnedAttachmentBox ticket={ticket} />
	) : (
		<AttachmentBoxView uploads={uploads} showUploadNames={false} />
	);
}
