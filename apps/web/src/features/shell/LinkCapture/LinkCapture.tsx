import { useNavigate } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { isDesktopApp } from "../../../lib/desktopBridge";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { interceptedLinkUrl } from "./interceptedLinkUrl";
import { internalLinkUrl } from "./internalLinkUrl";

// One listener handles the plain anchors in agent text, check results, and
// repository links. A Trellis record link resolves to an app route. A web
// link that asks for a new tab opens in the desktop browser sheet.
export function LinkCapture() {
	const { client } = useApp();
	const navigate = useNavigate();
	useEffect(() => {
		const desktop = isDesktopApp();
		const clicked = (event: MouseEvent) => {
			if (event.defaultPrevented) return;
			const anchor = (event.target as Element | null)?.closest("a[href]") ?? null;
			const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
			const link =
				anchor === null
					? null
					: { href: (anchor as HTMLAnchorElement).href, target: (anchor as HTMLAnchorElement).target };
			const internal = internalLinkUrl(link);
			if (internal !== null) {
				event.preventDefault();
				void client.internalLinks
					.resolve({ link: internal })
					.then(({ href }) => navigate({ href }))
					.catch((error: unknown) =>
						toast.error("The Trellis link did not open", { description: errorMessage(error) }),
					);
				return;
			}
			const url = interceptedLinkUrl(link, modified, desktop);
			if (url === null) return;
			event.preventDefault();
			pageSheetActions.openBrowser(url);
		};
		document.addEventListener("click", clicked);
		return () => document.removeEventListener("click", clicked);
	}, [client, navigate]);
	return null;
}
