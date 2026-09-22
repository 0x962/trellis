import { DotsSixVertical } from "@phosphor-icons/react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";

// The grip left of the block under the pointer. A drag moves the block, and a
// list item or a quote inside a list moves on its own. A click selects the
// block, so Backspace deletes it and the copy keys copy it.
export function BlockHandle({ editor }: { editor: Editor }) {
	return (
		<DragHandle editor={editor} nested>
			<span
				aria-hidden="true"
				className="mr-1 flex h-7 w-5 cursor-grab items-center justify-center rounded-sm text-fg-faint transition-colors duration-hover hover:bg-elevated hover:text-fg active:cursor-grabbing"
			>
				<DotsSixVertical className="size-4" weight="bold" />
			</span>
		</DragHandle>
	);
}
