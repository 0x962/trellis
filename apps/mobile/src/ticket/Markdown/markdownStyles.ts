import type { MarkdownStyleMap } from "@ronradtke/react-native-markdown-display";
import { layout } from "../../theme/layout";
import { type Palette, tokens } from "../../theme/tokens";

const mono = { fontFamily: tokens.font.mono, fontSize: tokens.text.sm };

const heading = { fontWeight: "600", marginTop: tokens.space[3], marginBottom: tokens.space[1] } as const;

// The style map of the markdown renderer for one palette. Every color
// comes from the palette, every size from the tokens. `body` sets the text
// color and size that every text node inherits.
export const markdownStyles = (palette: Palette): MarkdownStyleMap => ({
	body: { color: palette.fg, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	paragraph: { marginTop: tokens.space[1], marginBottom: tokens.space[2] },
	heading1: { ...heading, fontSize: tokens.text.xl, lineHeight: tokens.leading.xl },
	heading2: { ...heading, fontSize: tokens.text.lg, lineHeight: tokens.leading.lg },
	heading3: { ...heading, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	heading4: { ...heading, fontSize: tokens.text.md, lineHeight: tokens.leading.md },
	heading5: { ...heading, fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	heading6: { ...heading, fontSize: tokens.text.base, lineHeight: tokens.leading.base },
	hr: { backgroundColor: palette.border, height: tokens.hairline, marginVertical: tokens.space[3] },
	blockquote: {
		backgroundColor: palette.surface,
		borderColor: palette.borderStrong,
		borderLeftWidth: tokens.space.half,
		marginLeft: tokens.space[1],
		paddingHorizontal: tokens.space[2],
	},
	list_item: { marginBottom: tokens.space[1] },
	bullet_list_icon: { color: palette.fgMuted, marginLeft: tokens.space[2], marginRight: tokens.space[2] },
	ordered_list_icon: { color: palette.fgMuted, marginLeft: tokens.space[2], marginRight: tokens.space[2] },
	code_inline: {
		...mono,
		color: palette.fg,
		backgroundColor: palette.surface,
		borderColor: palette.border,
		borderWidth: tokens.hairline,
		borderRadius: tokens.radius.sm,
		padding: tokens.space.half,
	},
	code_block: {
		...mono,
		color: palette.fg,
		backgroundColor: palette.surface,
		borderColor: palette.border,
		borderWidth: tokens.hairline,
		borderRadius: tokens.radius.md,
		padding: tokens.space[2],
	},
	fence: { borderColor: palette.border, borderWidth: tokens.hairline, borderRadius: tokens.radius.md },
	fence_header: {
		backgroundColor: palette.elevated,
		borderBottomColor: palette.border,
		borderBottomWidth: tokens.hairline,
		paddingHorizontal: tokens.space[2],
		paddingVertical: tokens.space[1],
	},
	fence_language_label: { ...mono, fontSize: tokens.text.xs, color: palette.fgMuted },
	fence_copy_button: { paddingHorizontal: tokens.space[1], paddingVertical: tokens.space.half },
	fence_copy_text: { fontSize: tokens.text.xs, color: palette.fgMuted },
	fence_code: { backgroundColor: palette.surface, padding: tokens.space[2] },
	fence_token: { ...mono, color: palette.fg, lineHeight: tokens.leading.sm },
	table: { borderColor: palette.border, borderWidth: tokens.hairline, borderRadius: tokens.radius.sm },
	tr: { borderColor: palette.border, borderBottomWidth: tokens.hairline },
	th: { padding: tokens.space[1] },
	td: { padding: tokens.space[1] },
	link: { color: palette.accent },
	blocklink: { borderColor: palette.border, borderBottomWidth: tokens.hairline },
	image: { borderRadius: tokens.radius.md },
	// The task checkbox is drawn by the `list_item` rule from these two keys.
	task_box: {
		width: layout.statusIcon,
		height: layout.statusIcon,
		borderRadius: tokens.radius.sm,
		borderWidth: layout.ring,
		borderColor: palette.borderStrong,
		marginLeft: tokens.space[2],
		marginRight: tokens.space[2],
		marginTop: (tokens.leading.md - layout.statusIcon) / 2,
	},
	task_box_done: { backgroundColor: palette.accent, borderColor: palette.accent },
	task_check: { color: palette.onAccent, fontSize: tokens.micro.kbd, lineHeight: layout.statusIcon - layout.ring },
});
