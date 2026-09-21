import { useRouter } from "@tanstack/react-router";
import { eventApplierFor, type Ticket } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useMemo } from "react";
import { useApp } from "../../../../lib/appContext";
import { openLink } from "../../../../lib/openLink";
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
	const { client, queryClient } = useApp();
	const router = useRouter();
	return useMemo(
		() => ({
			client,
			origin: window.location.origin,
			copy: (text: string) => navigator.clipboard.writeText(text),
			confirm: askConfirm,
			notify,
			// `beginMutation` and `endMutation` are the pair that writes one
			// row into every cached query. The pair also releases the stream
			// events the applier holds for this ticket.
			applyCurrent: (current: Ticket) => {
				const applier = eventApplierFor(queryClient);
				applier.beginMutation(current.id);
				applier.endMutation(current.id, current);
			},
			openUrl: openLink,
			navigate: (to: string) => void router.navigate({ href: to }),
		}),
		[client, queryClient, router],
	);
};
