import { useNavigate } from "@tanstack/react-router";
import { type LinkPress, toast } from "@trellis/ui";
import { useCallback } from "react";
import { useApp } from "../../appContext";
import { errorMessage } from "../../conflict";
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
					// The browser tab store reads window.location and localStorage
					// when its module loads. This hook is imported by page components
					// whose fixtures render without a browser, so the store loads
					// here, on the first press that opens a tab, and not with the
					// module.
					const { pageTabsActions } = await import("../../../stores/pageTabsStore");
					pageTabsActions.addTab({ url: href, title: href });
					await navigate({ href, replace: true });
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
