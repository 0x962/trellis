import { linkPress } from "@trellis/ui";
import { useEffect } from "react";
import { isDesktopApp } from "../../../lib/desktopBridge";
import { useOpenLink } from "../../../lib/openLink";
import { opensSheet } from "../../../lib/opensSheet";
import { pageRefOfPathname } from "../../../lib/projectUrl";
import { ticketRefOfPathname } from "../../../lib/ticketUrl";
import { usePageSheetStore } from "../../../stores/pageSheetStore";
import { useTicketClick } from "../useTicketClick";
import { interceptedLinkUrl } from "./interceptedLinkUrl";

export function LinkCapture() {
	const open = useOpenLink();
	const clickTicket = useTicketClick();
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
		// The bubble listener lets row selection and link handlers act before
		// plain Markdown links open a sheet.
		const sheetClicked = (event: MouseEvent) => {
			if (event.defaultPrevented || !opensSheet(event)) return;
			const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
			if (anchor === null || anchor.hasAttribute("download")) return;
			if (anchor.origin !== location.origin) return;
			const sessionPage = usePageSheetStore.getState().session !== null && pageRefOfPathname(anchor.pathname) !== null;
			if (!anchor.pathname.startsWith("/t/") && !sessionPage) return;
			event.preventDefault();
			const ticket = ticketRefOfPathname(anchor.pathname);
			if (ticket !== null) clickTicket(ticket, event);
			else open(anchor.href);
		};
		document.addEventListener("click", clicked, true);
		document.addEventListener("click", sheetClicked);
		return () => {
			document.removeEventListener("click", clicked, true);
			document.removeEventListener("click", sheetClicked);
		};
	}, [open, clickTicket]);
	return null;
}
