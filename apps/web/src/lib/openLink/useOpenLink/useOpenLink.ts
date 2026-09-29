import { useNavigate } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { useCallback } from "react";
import { useApp } from "../../appContext";
import { errorMessage } from "../../conflict";
import { type LinkModifiers, openAppLink } from "../openAppLink";
import { openLink } from "../openLink";

export function useOpenLink() {
	const { client } = useApp();
	const navigate = useNavigate();
	return useCallback(
		(url: string, modifiers?: LinkModifiers) => {
			void openAppLink(
				url,
				{
					resolve: (input) => client.internalLinks.resolve(input),
					navigate: (href, _modifiers) => navigate({ href }),
					openWebLink: openLink,
				},
				modifiers,
			).catch((error: unknown) => toast.error("The link did not open", { description: errorMessage(error) }));
		},
		[client, navigate],
	);
}
