import { List } from "@phosphor-icons/react";
import { useState } from "react";
import { IconButton } from "../../../../primitives/IconButton";
import { Popover } from "../../../../primitives/Popover";
import { DocumentContents, type DocumentContentsProps } from "../DocumentContents";

export function ContentsMenu({ onSelect, ...contents }: DocumentContentsProps) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex shrink-0 justify-end border-b border-border px-4 py-2">
			<Popover
				label="Document contents"
				open={open}
				onOpenChange={setOpen}
				align="end"
				triggerTooltip="Contents"
				trigger={<IconButton label="Contents" icon={<List />} />}
				className="flex max-h-[min(var(--popover-max-height),var(--available-height))] w-70 max-w-(--available-width) flex-col overflow-hidden"
			>
				<DocumentContents
					{...contents}
					onSelect={(id) => {
						onSelect(id);
						setOpen(false);
					}}
				/>
			</Popover>
		</div>
	);
}
