import { createFileRoute } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { inboxInput } from "../../features/needs-you/hooks/useInbox";
import { NeedsYou } from "../../features/needs-you/NeedsYou";

// The home screen. The loader reads the inbox, so the page opens with its
// count and its rows. `peek` names the ticket the peek panel shows over the
// sections; the URL carries it so a reload opens the same panel.
export const Route = createFileRoute("/needs-you")({
	validateSearch: (search: Record<string, unknown>): { peek?: string } =>
		typeof search.peek === "string" ? { peek: TicketRefStringSchema.parse(search.peek) } : {},
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(context.orpc.inbox.get.queryOptions({ input: inboxInput })),
	component: NeedsYou,
});
