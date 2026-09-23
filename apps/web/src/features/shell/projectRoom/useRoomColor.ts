import { useQuery } from "@tanstack/react-query";
import { TicketRefStringSchema } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { ticketRefOfPathname } from "../../../lib/ticketUrl";
import { roomColorOfPath } from "./projectRoom";

// The color of the room the person stands in. The project list is in the
// cache already, because the sidebar and the command palette read it. A
// ticket page reads the ticket for the project it belongs to, which the
// ticket route loads before it draws.
//
// Each query gives back one value and not the whole row: a key, then a color
// name. The root of the app draws this hook, so a hook that gave back a row
// would redraw the whole app on every event that touches that row.
export const useRoomColor = (pathname: string): ProjectColor | null => {
	const { orpc } = useApp();
	const ref = TicketRefStringSchema.safeParse(ticketRefOfPathname(pathname) ?? "");
	const ticketProjectKey = useQuery({
		...orpc.tickets.get.queryOptions({ input: { ticket: ref.success ? ref.data : "" } }),
		enabled: ref.success,
		select: (ticket) => ticket.project.key,
	}).data;
	return (
		useQuery({
			...orpc.projects.list.queryOptions({ input: {} }),
			select: (projects) => roomColorOfPath(pathname, projects, ticketProjectKey ?? null),
		}).data ?? null
	);
};
