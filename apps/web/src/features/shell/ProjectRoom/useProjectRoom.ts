import { useQuery } from "@tanstack/react-query";
import { TicketRefStringSchema } from "@trellis/api";
import type { ProjectColor } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { roomColorOf, ticketOfPath } from "./projectRoom";

// The color of the room the person stands in. The project list is in the
// cache already, because the sidebar and the command palette read it. A
// ticket page reads the ticket for the project it belongs to, which the
// ticket route loads before it draws.
export const useProjectRoom = (pathname: string): ProjectColor | null => {
	const { orpc } = useApp();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	const identifier = TicketRefStringSchema.safeParse(ticketOfPath(pathname) ?? "");
	const ticket = useQuery({
		...orpc.tickets.get.queryOptions({ input: { ticket: identifier.success ? identifier.data : "" } }),
		enabled: identifier.success,
	}).data;
	return roomColorOf(pathname, projects ?? [], ticket?.project.path ?? null);
};
