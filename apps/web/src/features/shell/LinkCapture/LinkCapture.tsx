import { linkPress } from "@trellis/ui";
import { useEffect } from "react";
import { isDesktopApp } from "../../../lib/desktopBridge";
import { useOpenLink } from "../../../lib/openLink";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

export function LinkCapture() {
	const open = useOpenLink();
	useEffect(() => {
		const clicked = (event: MouseEvent) => {
			const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
			if (anchor === null || anchor.hasAttribute("download")) return;
			const url = anchor.href.startsWith("trellis:")
				? anchor.href
				: interceptedLinkUrl(anchor, isDesktopApp(), location.origin);
			if (url === null) return;
			event.preventDefault();
			event.stopPropagation();
			open(url, linkPress(event));
		};
		document.addEventListener("click", clicked, true);
		return () => document.removeEventListener("click", clicked, true);
	}, [open]);
	return null;
}
