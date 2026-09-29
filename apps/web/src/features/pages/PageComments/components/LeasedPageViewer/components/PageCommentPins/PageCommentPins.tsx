import type { PageCommentThread } from "@trellis/api";
import { PageCommentPin } from "@trellis/ui";
import { useMemo, useRef } from "react";

type NumberedThread = { number: number; thread: PageCommentThread };
type PinView = {
	number: number;
	threadId: string;
	label: string;
	resolved: boolean;
	onClick: () => void;
};

const PIN_RENDER_LIMIT = 200;

const pinLabel = ({ number, thread }: NumberedThread) => {
	const author = thread.creator.displayName ?? thread.creator.name;
	const state = thread.resolved === null ? "open" : "resolved";
	const anchor =
		thread.selectedText === null ? `element ${thread.anchor.path}` : `selected text "${thread.selectedText}"`;
	return `Comment ${number}, ${author}, ${state}, ${anchor}`;
};

export function PageCommentPins({
	threads,
	positions,
	selectedThread,
	onOpenThread,
}: {
	threads: NumberedThread[];
	positions: Map<string, { x: number; y: number }>;
	selectedThread: string | null;
	onOpenThread: (threadId: string) => void;
}) {
	const openThread = useRef(onOpenThread);
	openThread.current = onOpenThread;
	const pins = useMemo(
		() =>
			new Map(
				threads.map(({ number, thread }) => {
					const threadId = thread.id;
					return [
						threadId,
						{
							number,
							threadId,
							label: pinLabel({ number, thread }),
							resolved: thread.resolved !== null,
							onClick: () => openThread.current(threadId),
						} satisfies PinView,
					];
				}),
			),
		[threads],
	);
	const selectedPosition = selectedThread === null ? undefined : positions.get(selectedThread);
	const visible: { pin: PinView; position: { x: number; y: number } }[] = [];
	const otherLimit = PIN_RENDER_LIMIT - (selectedPosition === undefined ? 0 : 1);
	for (const [threadId, position] of positions) {
		if (threadId === selectedThread) continue;
		const pin = pins.get(threadId);
		if (pin !== undefined) visible.push({ pin, position });
		if (visible.length === otherLimit) break;
	}
	if (selectedThread !== null && selectedPosition !== undefined) {
		const pin = pins.get(selectedThread);
		if (pin !== undefined) visible.push({ pin, position: selectedPosition });
	}
	return visible.map(({ pin, position }) => (
		<PageCommentPin
			key={pin.threadId}
			number={pin.number}
			label={pin.label}
			x={position.x}
			y={position.y}
			resolved={pin.resolved}
			selected={selectedThread === pin.threadId}
			onClick={pin.onClick}
		/>
	));
}
