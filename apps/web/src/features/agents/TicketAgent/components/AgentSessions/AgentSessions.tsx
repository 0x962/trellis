import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { AgentSession } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { AgentFailure } from "../../../../agent/AgentFailure";
import { AgentStateBadge } from "../../../../agent/AgentStateBadge";
import { runnerRefusal } from "../../../../agent/utils/runnerRefusal";

export type AgentSessionsProps = {
	identifier: string;
};

const roleLabels = { manager: "Manager", builder: "Builder", reviewer: "Reviewer" } as const;

// A builder in one of these states holds a terminal, so a second start
// returns it and the row offers no Start builder.
const liveStates = new Set(["starting", "running", "waiting"]);

const byCreated = (a: AgentSession, b: AgentSession) => a.createdAt.localeCompare(b.createdAt);

const refusal = (error: unknown) => {
	if (error instanceof ORPCError && error.code === "CONCURRENCY_LIMIT") {
		const { limit, running } = error.data as { limit: number; running: number };
		return `Limit reached: ${running} of ${limit} builders run.`;
	}
	return runnerRefusal(error);
};

// The builder and reviewer sessions of one ticket, oldest first, each with
// its person name, its role, its state, and a link into its Superset
// workspace. A person calls an agent by the name, so the name leads the
// item. An agents.session event refetches agents.sessions, so the states
// follow the runner live. The list sits under the Agent heading of
// TicketAgent, which is the one agent heading of the rail.
export function AgentSessions({ identifier }: AgentSessionsProps) {
	const { client, orpc, queryClient } = useApp();
	const options = orpc.agents.sessions.queryOptions({ input: { ticket: identifier } });
	const sessions = useQuery(options).data?.sessions;
	const [starting, setStarting] = useState(false);

	const start = async () => {
		setStarting(true);
		try {
			const session = await client.agents.startBuilder({ ticket: identifier });
			queryClient.setQueryData(options.queryKey, (current) => ({
				sessions: [...(current?.sessions ?? []).filter((entry) => entry.id !== session.id), session],
			}));
		} catch (error) {
			toast.error("Couldn't start a builder", { description: refusal(error) });
		} finally {
			setStarting(false);
		}
	};

	if (sessions === undefined) return null;
	const ordered = [...sessions].sort(byCreated);
	const building = ordered.some((session) => session.role === "builder" && liveStates.has(session.state));

	return (
		<div className="flex min-w-0 flex-col items-start gap-1">
			{ordered.length === 0 ? (
				<span className="text-fg-faint">None</span>
			) : (
				<ul aria-label="Agent sessions" className="flex flex-col gap-1">
					{ordered.map((session) => (
						<li key={session.id} className="flex min-w-0 items-center gap-2">
							<span>{session.name}</span>
							<span className="text-fg-muted">{roleLabels[session.role]}</span>
							<AgentStateBadge state={session.state} />
							{session.state === "failed" && <AgentFailure id={session.id} error={session.error} />}
						</li>
					))}
				</ul>
			)}
			{!building && (
				<Button size="sm" disabled={starting} onClick={() => void start()}>
					Start builder
				</Button>
			)}
		</div>
	);
}
