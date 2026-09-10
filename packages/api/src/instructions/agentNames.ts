// A manager serves one project. A builder and a reviewer serve one ticket.
export type AgentName = { role: "manager"; project: string } | { role: "builder" | "reviewer"; ticket: string };

// The name of the agent's tab in Superset: "CDE manager", "CDE-42", or
// "CDE-42 review".
export const agentTitle = (name: AgentName): string => {
	if (name.role === "manager") return `${name.project} manager`;
	return name.role === "builder" ? name.ticket : `${name.ticket} review`;
};

// The actor name of every trellis command the agent runs: "manager-cde",
// "builder-cde-42", or "reviewer-cde-42". The activity of a ticket then
// shows which agent made each change.
export const agentActorName = (name: AgentName): string =>
	`${name.role}-${(name.role === "manager" ? name.project : name.ticket).toLowerCase()}`;

// The `x-trellis-actor` value: "agent:builder-cde-42".
export const agentActor = (name: AgentName): string => `agent:${agentActorName(name)}`;
