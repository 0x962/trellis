import { isLinkBrowserUrl } from "@trellis/api";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { isDesktopApp } from "../desktopBridge";

export type LinkOpenAction = "browser-sheet" | "new-tab";

// Where a link opens. The desktop app holds an HTTPS page in the browser
// sheet, so the person stays in Trellis. The browser build has no webview,
// and an address that is not HTTPS is refused by the desktop handler, so
// both open a tab of the browser.
export const linkOpenAction = (url: string, desktop: boolean): LinkOpenAction =>
	desktop && isLinkBrowserUrl(url) ? "browser-sheet" : "new-tab";

// Opens one link the way `linkOpenAction` names. Every control in the app
// that leads to a web page calls this.
export const openLink = (url: string) => {
	if (linkOpenAction(url, isDesktopApp()) === "browser-sheet") {
		pageSheetActions.openBrowser(url);
		return;
	}
	window.open(url, "_blank", "noopener,noreferrer");
};
