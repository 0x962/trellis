import type { PageCommentThread } from "@trellis/api";
import { PageCommentPin } from "@trellis/ui";

type NumberedThread = { number: number; thread: PageCommentThread };

const pinLabel = ({ number, thread }: NumberedThread) => {
	const author = thread.creator.displayName ?? thread.creator.name;
	const state = thread.resolved === null ? "open" : "resolved";
	const anchor =
		thread.selectedText === null ? `element ${thread.anchor.path}` : `selected text "${thread.selectedText}"`;
	return `Comment ${number}, ${author}, ${state}, ${anchor}`;
};

export function PageCommentPins({
	comments,
	positions,
	selectedThread,
	onOpenThread,
}: {
	comments: NumberedThread[];
	positions: Map<string, { x: number; y: number }>;
	selectedThread: string | null;
	onOpenThread: (thread: string) => void;
}) {
	return comments.map((comment) => {
		const position = positions.get(comment.thread.id);
		return position === undefined ? null : (
			<PageCommentPin
				key={comment.thread.id}
				number={comment.number}
				label={pinLabel(comment)}
				x={position.x}
				y={position.y}
				resolved={comment.thread.resolved !== null}
				selected={selectedThread === comment.thread.id}
				onClick={() => onOpenThread(comment.thread.id)}
			/>
		);
	});
}
