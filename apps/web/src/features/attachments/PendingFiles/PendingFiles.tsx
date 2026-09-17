import { File as FileIcon, Plus, X } from "@phosphor-icons/react";
import { Button, IconButton, Tooltip } from "@trellis/ui";
import { type ChangeEvent, useRef, useState } from "react";
import { formatBytes } from "../utils/formatBytes";

export type PendingFilesProps = {
	// The files the caller holds in the browser. The caller uploads them
	// itself once its create call answers with an id.
	files: File[];
	// Adds picked files to the end of the list.
	onAdd: (files: File[]) => void;
	// Removes the file at the index.
	onRemove: (index: number) => void;
};

// TRL-23. A file picker for a form that creates the row the files attach to:
// an Add control, and one row per picked file with its size and a remove
// action. The component holds no state of its own, so every caller keeps the
// files in its own draft and uploads them after its create call answers.
export function PendingFiles({ files, onAdd, onRemove }: PendingFilesProps) {
	const picker = useRef<HTMLInputElement>(null);
	// A stable key per held file. Two picks of one file are distinct objects,
	// so the name alone cannot tell them apart.
	const [keys] = useState(() => new WeakMap<File, string>());
	const keyOf = (file: File) => {
		const seen = keys.get(file);
		if (seen !== undefined) return seen;
		const next = crypto.randomUUID();
		keys.set(file, next);
		return next;
	};
	const selected = (event: ChangeEvent<HTMLInputElement>) => {
		onAdd([...event.target.files!]);
		event.target.value = "";
	};

	return (
		<div className="flex flex-col gap-2">
			<div>
				<Button variant="quiet" size="sm" icon={<Plus />} onClick={() => picker.current!.click()}>
					Add
				</Button>
				<input ref={picker} type="file" multiple className="hidden" aria-label="Choose files" onChange={selected} />
			</div>
			{files.map((file, index) => (
				<div key={keyOf(file)} className="flex h-10 items-center gap-3 rounded-md border border-border bg-surface px-3">
					<span aria-hidden="true" className="inline-flex size-4 shrink-0 text-fg-muted *:size-full">
						<FileIcon />
					</span>
					<span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{file.name}</span>
					<span className="text-sm text-fg-muted tabular">{formatBytes(file.size)}</span>
					<Tooltip content="Remove">
						<IconButton
							label={`Remove ${file.name}`}
							icon={<X />}
							variant="quiet"
							size="sm"
							onClick={() => onRemove(index)}
						/>
					</Tooltip>
				</div>
			))}
		</div>
	);
}
