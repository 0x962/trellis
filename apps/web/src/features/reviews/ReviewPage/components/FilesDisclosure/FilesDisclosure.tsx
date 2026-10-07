import { GroupHeader } from "@trellis/ui";
import { fileCountLabel } from "@trellis/ui/review";
import { type ReactNode, useId } from "react";

export type FilesDisclosureProps = {
	// True while the window is narrower than 768 px.
	phone: boolean;
	// The changed file count of the revision, for the word beside the button.
	count: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
};

// The children stay mounted while Files is closed because DiffPane reports
// the changed files that the header counts.
export function FilesDisclosure({ phone, count, open, onOpenChange, children }: FilesDisclosureProps) {
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
					onToggle={() => onOpenChange(!open)}
				/>
			)}
			<div id={id} className="review-files-box" hidden={phone && !open}>
				{children}
			</div>
		</>
	);
}
