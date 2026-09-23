import { toast, writeClipboard } from "@trellis/ui";

export type CopyBrowserLinkDependencies = {
	writeText: (text: string) => Promise<void>;
	notify: (message: string) => void;
	fail: (message: string) => void;
};

const browserCopyDependencies: CopyBrowserLinkDependencies = {
	writeText: (text) => writeClipboard(text),
	notify: toast,
	fail: toast.error,
};

// The toast confirms the copy only after the clipboard took the link. A
// refused write shows an error toast, so the person never pastes an old link.
//
// An empty address is a refusal. `BrowserPage` reads the address from the
// `<webview>`, and Electron answers "" while no page is attached. A write of
// "" succeeds and empties the clipboard, so a confirmation there would name a
// link that the person cannot paste.
export const copyBrowserLink = async (
	url: string,
	dependencies: CopyBrowserLinkDependencies = browserCopyDependencies,
) => {
	if (url === "") {
		dependencies.fail("The link was not copied.");
		return;
	}
	try {
		await dependencies.writeText(url);
	} catch {
		dependencies.fail("The link was not copied.");
		return;
	}
	dependencies.notify("Link copied");
};
