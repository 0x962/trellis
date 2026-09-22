type ClipboardWindow = Window & { trellisDesktop?: { writeClipboard?: (text: string) => Promise<void> } };

// Puts `text` on the system clipboard. The macOS app refuses every web
// permission to its window, so `navigator.clipboard.writeText` rejects there;
// the app's `window.trellisDesktop.writeClipboard` writes through Electron
// instead. The browser build has no `trellisDesktop` and uses the web API.
export const writeClipboard = (text: string, target: ClipboardWindow = window): Promise<void> =>
	target.trellisDesktop?.writeClipboard?.(text) ?? target.navigator.clipboard.writeText(text);
