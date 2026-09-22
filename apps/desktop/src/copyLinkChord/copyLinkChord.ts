type KeyInput = { type: string; key: string; shift: boolean; meta: boolean; control: boolean; alt: boolean };

// Command+Shift+C (Control+Shift+C off a Mac) is the Copy link shortcut of
// the in-app browser. A key press inside the `<webview>` page goes to that
// page and never reaches the Trellis window, so the main process reads the
// page's keys with `before-input-event` and uses this test to pick the chord.
export const isCopyLinkChord = (input: KeyInput) =>
	input.type === "keyDown" &&
	input.key.toLowerCase() === "c" &&
	input.shift &&
	(input.meta || input.control) &&
	!input.alt;
