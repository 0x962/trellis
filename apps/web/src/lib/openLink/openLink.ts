import { isLinkBrowserUrl } from "@trellis/api";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { isDesktopApp } from "../desktopBridge";
import type { LinkModifiers } from "./openAppLink";

export type LinkOpenAction = "browser-sheet" | "new-tab";

export const linkOpenAction = (
	url: string,
	desktop: boolean,
	modifiers?: Pick<LinkModifiers, "metaKey">,
): LinkOpenAction => {
	if (!isLinkBrowserUrl(url)) throw new Error("This link has an unsupported or invalid address.");
	return desktop && !modifiers?.metaKey ? "browser-sheet" : "new-tab";
};

export const openLink = (url: string, modifiers?: Pick<LinkModifiers, "metaKey">) => {
	if (linkOpenAction(url, isDesktopApp(), modifiers) === "browser-sheet") {
		pageSheetActions.openBrowser(url);
		return;
	}
	window.open(url, "_blank", "noopener,noreferrer");
};
