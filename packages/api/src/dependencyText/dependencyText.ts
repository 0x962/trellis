import type { TicketSummary } from "../schemas/ticket.ts";

type Dependency = TicketSummary["waitsOn"][number];

export const statusText = (dependency: Pick<Dependency, "status">): string => {
	if (dependency.status === "started") return "in progress";
	if (dependency.status === "review") return "agent review";
	return dependency.status;
};
