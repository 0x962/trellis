import { useNavigate } from "@tanstack/react-router";
import { type LinkPress, toast } from "@trellis/ui";
import { useCallback } from "react";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import { useApp } from "../../appContext";
import { errorMessage } from "../../conflict";
import { ticketRefOfPathname } from "../../ticketUrl";
import { openAppLink } from "../openAppLink";
import { openLink } from "../openLink";
import { sameOriginRouteHref } from "../sameOriginRouteHref";

export function useOpenLink() {
	const { client } = useApp();
	const navigate = useNavigate();
	return useCallback(
		(url: string, press?: LinkPress) => {
			const openTrellisRoute = async (href: string, linkPress?: LinkPress) => {
				if (linkPress?.metaKey) {
					// pageTabsStore reads browser globals when its module loads. The
					// dynamic import lets page fixtures load useOpenLink without them.
					const { pageTabsActions } = await import("../../../stores/pageTabsStore");
					pageTabsActions.addTab({ url: href, title: href });
					await navigate({ href, replace: true });
					return;
				}
				const ticket = ticketRefOfPathname(new URL(href, location.origin).pathname);
				if (ticket !== null) {
					pageSheetActions.openTicket(ticket);
					return;
				}
				await navigate({ href });
			};
			const href = sameOriginRouteHref(url, location.origin);
			if (href !== null) {
				void openTrellisRoute(href, press).catch((error: unknown) =>
					toast.error("The link did not open", { description: errorMessage(error) }),
				);
				return;
			}
			void openAppLink(
				url,
				{
					resolve: (input) => client.internalLinks.resolve(input),
					navigate: openTrellisRoute,
					openWebLink: openLink,
				},
				press,
			).catch((error: unknown) => toast.error("The link did not open", { description: errorMessage(error) }));
		},
		[client, navigate],
	);
}
