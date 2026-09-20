import type { TicketSummary } from "../schemas/ticket.ts";

type Dependency = TicketSummary["waitsOn"][number];

export const statusText = (dependency: Pick<Dependency, "isQuestion" | "status">): string => {
	if (dependency.status === "started") return "in progress";
	if (dependency.status === "review") return dependency.isQuestion ? "human review" : "agent review";
	return dependency.status;
};

// A question waits for a person's answer. Every other dependency waits for a pull request to merge.
export const blockReason = (dependency: Pick<Dependency, "isQuestion">): string =>
	dependency.isQuestion ? "is open" : "is not merged";
