import { useRouter } from "@tanstack/react-router";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useApp } from "../../../../lib/appContext";
import type { ActionContext, NotifyOptions } from "../../actions";
import { askConfirm } from "../../confirmStore";

// A retry action repeats the failed request.
const notify = (message: string, options?: NotifyOptions) => {
	if (options?.retry !== undefined) {
		toast.error(message, { action: { label: "Retry", onClick: options.retry } });
		return;
	}
	toast(message);
};

// The effects an action runs with on this page: the client that carries
// the actor header, the clipboard, the confirm dialog, and the router.
export const useActionContext = (): ActionContext => {
	const { client } = useApp();
	const router = useRouter();
	return useMemo(
		() => ({
			client,
			origin: window.location.origin,
			copy: (text: string) => navigator.clipboard.writeText(text),
			confirm: askConfirm,
			notify,
			openUrl: (url: string) => {
				window.open(url, "_blank", "noopener");
			},
			navigate: (to: string) => void router.navigate({ href: to }),
		}),
		[client, router],
	);
};
