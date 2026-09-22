import { ChatText, Code, LinkSimple, TextB, TextItalic, TextStrikethrough } from "@phosphor-icons/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { type Editor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { IconButton, Input, Tooltip } from "@trellis/ui";
import { type ReactElement, useState } from "react";

type Mark = "bold" | "italic" | "strike" | "code";

const marks: readonly { mark: Mark; label: string; keys: string; icon: ReactElement }[] = [
	{ mark: "bold", label: "Bold", keys: "⌘B", icon: <TextB /> },
	{ mark: "italic", label: "Italic", keys: "⌘I", icon: <TextItalic /> },
	{ mark: "strike", label: "Strikethrough", keys: "⌘⇧S", icon: <TextStrikethrough /> },
	{ mark: "code", label: "Inline code", keys: "⌘E", icon: <Code /> },
];

// The menu over a text selection: the four marks, a link, and a comment on a
// page that takes comments. The link button swaps the buttons for a field
// that takes the address. Enter sets the link, an empty field removes it, and
// Escape goes back to the buttons.
export function FormatMenu({ editor, onComment }: { editor: Editor; onComment: (() => void) | undefined }) {
	const [linkDraft, setLinkDraft] = useState<string | null>(null);
	const active = useEditorState({
		editor,
		selector: ({ editor: current }) => ({
			bold: current.isActive("bold"),
			italic: current.isActive("italic"),
			strike: current.isActive("strike"),
			code: current.isActive("code"),
			link: current.isActive("link"),
		}),
	});
	const applyLink = (href: string) => {
		const range = editor.chain().focus().extendMarkRange("link");
		if (href === "") range.unsetLink().run();
		else range.setLink({ href }).run();
		setLinkDraft(null);
	};
	return (
		<BubbleMenu
			editor={editor}
			// A drag handle selects a whole block, and a table selects cells.
			// The marks apply to text, so the menu shows for a text selection only.
			shouldShow={({ editor: current, view, state, element }) => {
				const { selection } = state;
				if (!(selection instanceof TextSelection) || selection instanceof NodeSelection || selection.empty)
					return false;
				if (current.isActive("codeBlock")) return false;
				return view.hasFocus() || element.contains(document.activeElement);
			}}
			options={{ onHide: () => setLinkDraft(null) }}
			className="z-40 flex items-center gap-0.5 rounded-lg border border-border bg-elevated p-1 shadow-md"
		>
			{linkDraft === null ? (
				<>
					{marks.map(({ mark, label, keys, icon }) => (
						<Tooltip key={mark} content={`${label} ${keys}`}>
							<IconButton
								label={label}
								icon={icon}
								pressed={active[mark]}
								onClick={() => editor.chain().focus().toggleMark(mark).run()}
							/>
						</Tooltip>
					))}
					<Tooltip content="Link">
						<IconButton
							label="Link"
							icon={<LinkSimple />}
							pressed={active.link}
							onClick={() => setLinkDraft(editor.getAttributes("link").href ?? "")}
						/>
					</Tooltip>
					{onComment !== undefined && (
						<Tooltip content="Comment">
							<IconButton label="Comment" icon={<ChatText />} onClick={onComment} />
						</Tooltip>
					)}
				</>
			) : (
				<Input
					label="Link address"
					hideLabel
					autoFocus
					value={linkDraft}
					placeholder="Paste a link, or clear it to remove the link"
					className="w-72"
					onChange={(event) => setLinkDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							applyLink(linkDraft.trim());
						}
						if (event.key === "Escape") {
							event.preventDefault();
							event.stopPropagation();
							setLinkDraft(null);
							editor.commands.focus();
						}
					}}
				/>
			)}
		</BubbleMenu>
	);
}
