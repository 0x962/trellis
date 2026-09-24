import { Paperclip } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import type { Uploads } from "../hooks/useUploads";

export type AttachmentBoxProps = {
	// The upload list of the surface that draws this control. The surface
	// renders the progress rows, so this control only adds files to the list.
	uploads: Uploads;
};

// The control that picks files and takes a drop. It is a round icon button,
// because every icon action of the app is one.
export function AttachmentBox({ uploads }: AttachmentBoxProps) {
	const picker = useRef<HTMLInputElement>(null);
	const [over, setOver] = useState(false);
	const { addFiles } = uploads;

	const choose = () => picker.current!.click();
	const selected = (event: ChangeEvent<HTMLInputElement>) => {
		addFiles([...event.target.files!]);
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
		addFiles([...event.dataTransfer.files]);
	};
	const dragLeave = (event: DragEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		setOver(false);
	};

	return (
		<>
			<input ref={picker} type="file" multiple className="hidden" onChange={selected} />
			<Tooltip content="Add attachment">
				<IconButton
					variant="quiet"
					size="sm"
					label="Add attachment"
					icon={<Paperclip />}
					data-attachment-box=""
					data-over={String(over)}
					onClick={choose}
					onDragOver={dragOver}
					onDragLeave={dragLeave}
					onDrop={drop}
				/>
			</Tooltip>
		</>
	);
}
