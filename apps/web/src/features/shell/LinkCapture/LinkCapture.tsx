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
			const press = linkPress(event);
			const newTab = press.metaKey || anchor.target === "_blank";
			const url = anchor.href.startsWith("trellis:")
				? anchor.href
				: interceptedLinkUrl(anchor, isDesktopApp(), location.origin, newTab);
			if (url === null) return;
			event.preventDefault();
			event.stopPropagation();
			const internalTarget = url.startsWith("trellis:") || new URL(url).origin === location.origin;
			open(url, anchor.target === "_blank" && internalTarget ? { ...press, metaKey: true } : press);
		};
		document.addEventListener("click", clicked, true);
		return () => document.removeEventListener("click", clicked, true);
	}, [open]);
	return null;
}
