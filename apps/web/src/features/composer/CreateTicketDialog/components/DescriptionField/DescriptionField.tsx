import { lazy, Suspense } from "react";
import { ReadOnlyMarkdown } from "../../../../ticket/Description/components/ReadOnlyMarkdown";

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

// The description: rendered read-only until it takes focus, then the
// editor. The editor's chunk loads on that first focus.
export function DescriptionField({ markdown, editing, onEdit, onChange }: DescriptionFieldProps) {
	if (editing) {
		return (
			<div className="min-h-32 rounded-md border border-border bg-surface px-3 py-2 text-base">
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
			className="min-h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-left text-base transition-colors duration-hover hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
		>
			{markdown.trim() === "" ? (
				<span className="text-fg-faint">Add a description</span>
			) : (
				<ReadOnlyMarkdown markdown={markdown} />
			)}
		</button>
	);
}
