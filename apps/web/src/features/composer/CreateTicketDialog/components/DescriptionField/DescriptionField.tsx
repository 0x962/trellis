import { lazy, Suspense } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";

const DescriptionEditor = lazy(() =>
	import("../DescriptionEditor/DescriptionEditor").then((module) => ({ default: module.DescriptionEditor })),
);

export type DescriptionFieldProps = {
	markdown: string;
	// True once the description took focus: the editor then stays mounted.
	editing: boolean;
	onEdit: () => void;
	onChange: (markdown: string) => void;
};

// The writing area grows until it reaches half the screen. The text starts
// at the top edge and the area scrolls after it reaches that limit. The first
// letter must sit on the same left edge as the ticket title above the area and
// the property chips under it.
const area = "max-h-[50vh] min-h-20 w-full overflow-y-auto text-left text-base text-fg";

// The description: rendered read-only until it takes focus, then the
// editor. The editor's chunk loads on that first focus.
export function DescriptionField({ markdown, editing, onEdit, onChange }: DescriptionFieldProps) {
	if (editing) {
		return (
			<div className={area}>
				<Suspense fallback={<ReadOnlyMarkdown markdown={markdown} />}>
					<DescriptionEditor markdown={markdown} onChange={onChange} />
				</Suspense>
			</div>
		);
	}
	return (
		<button
			type="button"
			aria-label="Edit description"
			onClick={onEdit}
			onFocus={onEdit}
			className={`${area} flex flex-col justify-start rounded-sm focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2`}
		>
			{markdown.trim() === "" ? (
				<span className="text-fg-faint">Add a description</span>
			) : (
				<ReadOnlyMarkdown markdown={markdown} />
			)}
		</button>
	);
}
