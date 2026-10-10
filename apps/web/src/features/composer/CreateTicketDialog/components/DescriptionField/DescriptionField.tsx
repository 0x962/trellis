import { lazy, Suspense, useRef } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";

const DescriptionEditor = lazy(() =>
	import("../../../../../components/MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })),
);

export type DescriptionFieldProps = {
	markdown: string;
	// True once the description took focus: the editor then stays mounted.
	editing: boolean;
	onEdit: () => void;
	onChange: (markdown: string) => void;
};

const area = "ticket-composer-description text-fg";

// The description: rendered read-only until it takes focus, then the
// editor. The editor's chunk loads on that first focus.
export function DescriptionField({ markdown, editing, onEdit, onChange }: DescriptionFieldProps) {
	const focusEditor = useRef(false);
	const edit = () => {
		focusEditor.current = true;
		onEdit();
	};
	if (editing) {
		return (
			<div className={area}>
				<Suspense fallback={<ReadOnlyMarkdown markdown={markdown} />}>
					<DescriptionEditor autofocus={focusEditor.current} markdown={markdown} onChange={onChange} />
				</Suspense>
			</div>
		);
	}
	return (
		<button
			type="button"
			aria-label="Edit description"
			onClick={edit}
			onFocus={edit}
			className={`${area} flex flex-col justify-start`}
		>
			{markdown.trim() === "" ? (
				<span className="text-fg-faint">Add a description</span>
			) : (
				<ReadOnlyMarkdown markdown={markdown} />
			)}
		</button>
	);
}
