import { GroupHeader } from "@trellis/ui";
import { fileCountLabel } from "@trellis/ui/review";
import { type ReactNode, useId, useState } from "react";

export type FilesDisclosureProps = {
	// True while the window is narrower than 768 px.
	phone: boolean;
	// The changed file count of the revision, for the word beside the button.
	count: number;
	children: ReactNode;
};

// The file tree and the diff of the review page. A person does not read a
// diff on a phone, so under 768 px one button named Files opens and shuts
// both. A wider window draws both panes and no button.
//
// The box keeps its children in the tree while it is shut, because `DiffPane`
// inside it reports the changed file list that `FileRiskGroups` draws and that
// the button counts.
export function FilesDisclosure({ phone, count, children }: FilesDisclosureProps) {
	const [open, setOpen] = useState(false);
	const id = useId();
	return (
		<>
			{phone && (
				<GroupHeader
					group="files"
					label="Files"
					count={fileCountLabel(count)}
					expanded={open}
					controls={id}
					phone
					onToggle={() => setOpen(!open)}
				/>
			)}
			<div id={id} className="review-files-box" hidden={phone && !open}>
				{children}
			</div>
		</>
	);
}
