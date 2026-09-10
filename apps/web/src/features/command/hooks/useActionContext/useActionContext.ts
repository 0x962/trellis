import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useApp } from "../../../../lib/appContext";
import type { ActionContext, NotifyOptions } from "../../actions";

// A message with a command shows the command ready to paste; a message
// with a retry offers the same call again.
const notify = (message: string, options?: NotifyOptions) => {
	if (options?.command !== undefined) {
		toast.command({ title: message, command: options.command });
		return;
	}
	if (options?.retry !== undefined) {
		toast.error(message, { action: { label: "Retry", onClick: options.retry } });
		return;
	}
	toast(message);
};

// The effects an action runs with on this page: the client that carries
// the actor header, the settings, the clipboard, and the router.
export const useActionContext = (): ActionContext => {
	const { client, orpc } = useApp();
	const router = useRouter();
	const settings = useSuspenseQuery(orpc.settings.get.queryOptions()).data;
	return useMemo(
		() => ({
			client,
			settings,
			origin: window.location.origin,
			copy: (text: string) => navigator.clipboard.writeText(text),
			confirm: async (message: string) => window.confirm(message),
			notify,
			openUrl: (url: string) => {
				window.open(url, "_blank", "noopener");
			},
			navigate: (to: string) => void router.navigate({ href: to }),
		}),
		[client, settings, router],
	);
};
