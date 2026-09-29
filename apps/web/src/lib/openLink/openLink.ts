import { isLinkBrowserUrl } from "@trellis/api";
import type { LinkPress } from "@trellis/ui";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { isDesktopApp } from "../desktopBridge";

export type LinkOpenAction = "browser-sheet" | "new-tab";

export const linkOpenAction = (url: string, desktop: boolean, press?: Pick<LinkPress, "metaKey">): LinkOpenAction => {
	if (!isLinkBrowserUrl(url)) throw new Error("This link has an unsupported or invalid address.");
	return desktop && !press?.metaKey ? "browser-sheet" : "new-tab";
};

export const openLink = (url: string, press?: Pick<LinkPress, "metaKey">) => {
	if (linkOpenAction(url, isDesktopApp(), press) === "browser-sheet") {
		pageSheetActions.openBrowser(url);
		return;
	}
	window.open(url, "_blank", "noopener,noreferrer");
};
