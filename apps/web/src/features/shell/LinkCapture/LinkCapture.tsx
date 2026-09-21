import { useEffect } from "react";
import { isDesktopApp } from "../../../lib/desktopBridge";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

// Every link that asks for a new tab opens in the browser sheet of the
// desktop app. The app holds markdown from agents, check results, and
// repository links, and each one is a plain anchor, so this one listener
// answers them all and no anchor needs its own handler.
export function LinkCapture() {
	useEffect(() => {
		const desktop = isDesktopApp();
		const clicked = (event: MouseEvent) => {
			if (event.defaultPrevented) return;
			const anchor = (event.target as Element | null)?.closest("a[href]") ?? null;
			const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
			const url = interceptedLinkUrl(
				anchor === null
					? null
					: { href: (anchor as HTMLAnchorElement).href, target: (anchor as HTMLAnchorElement).target },
				modified,
				desktop,
			);
			if (url === null) return;
			event.preventDefault();
			pageSheetActions.openBrowser(url);
		};
		document.addEventListener("click", clicked);
		return () => document.removeEventListener("click", clicked);
	}, []);
	return null;
}
