// The page that shows the shared editor now: the ticket description or an
// epic document. One Tiptap instance serves every page, so its extensions
// read these values at the moment they need them. `EditorView` writes them
// on every render, before the editor draws.
export type EditorHost = {
	// The words an empty editor shows.
	placeholder: string;
	// Takes the files that a person pastes, drops, or picks from the Image
	// block of the slash menu.
	attachFiles: (files: File[]) => void;
	// Opens the file picker of the browser for the Image block.
	pickFiles: () => void;
	// Opens a comment thread, on a click on its text. Null on a page that
	// takes no comments.
	openThread: ((id: string) => void) | null;
};

let current: EditorHost | null = null;

export const editorHost = {
	set: (host: EditorHost) => {
		current = host;
	},
	get: (): EditorHost => current!,
};
