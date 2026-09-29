import { useNavigate } from "@tanstack/react-router";
import { type LinkPress, toast } from "@trellis/ui";
import { useCallback } from "react";
import { pageTabsActions } from "../../../stores/pageTabsStore";
import { useApp } from "../../appContext";
import { errorMessage } from "../../conflict";
import { internalAppHref } from "../internalAppHref";
import { openAppLink } from "../openAppLink";
import { openLink } from "../openLink";

export function useOpenLink() {
	const { client } = useApp();
	const navigate = useNavigate();
	return useCallback(
		(url: string, press?: LinkPress) => {
			const navigateInApp = async (href: string, linkPress?: LinkPress) => {
				if (linkPress?.metaKey) {
					pageTabsActions.addTab({ url: href, title: href });
					await navigate({ href, replace: true });
					return;
				}
				await navigate({ href });
			};
			const href = internalAppHref(url, location.origin);
			if (href !== null) {
				void navigateInApp(href, press).catch((error: unknown) =>
					toast.error("The link did not open", { description: errorMessage(error) }),
				);
				return;
			}
			void openAppLink(
				url,
				{
					resolve: (input) => client.internalLinks.resolve(input),
					navigate: navigateInApp,
					openWebLink: openLink,
				},
				press,
			).catch((error: unknown) => toast.error("The link did not open", { description: errorMessage(error) }));
		},
		[client, navigate],
	);
}
