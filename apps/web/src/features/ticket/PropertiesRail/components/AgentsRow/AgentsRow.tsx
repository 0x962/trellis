import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import type { AgentSession, RunnerReason } from "@trellis/api";
import { Button, toast } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { AgentStateBadge } from "../../../../agent/AgentStateBadge";
import { OpenInSuperset } from "../../../../agent/OpenInSuperset";
import { runnerReasonLine } from "../../../../agent/utils/runnerReasonLine";
import { Row } from "../Row";

export type AgentsRowProps = {
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
	if (error instanceof ORPCError && error.code === "RUNNER_UNAVAILABLE") {
		return runnerReasonLine[(error.data as { reason: RunnerReason }).reason];
	}
	return (error as Error).message;
};

// The builder and reviewer sessions of one ticket, oldest first, each with
// its state and a link into its Superset workspace. An agents.session event
// refetches agents.sessions, so the states follow the runner live.
export function AgentsRow({ identifier }: AgentsRowProps) {
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

	if (sessions === undefined) return <Row label="Agents">{null}</Row>;
	const ordered = [...sessions].sort(byCreated);
	const building = ordered.some((session) => session.role === "builder" && liveStates.has(session.state));

	return (
		<Row label="Agents">
			<div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1">
				{ordered.length === 0 ? (
					<span className="text-fg-faint">None</span>
				) : (
					<ul aria-label="Agent sessions" className="flex flex-col gap-1">
						{ordered.map((session) => (
							<li key={session.id} className="flex items-center gap-2">
								<span>{roleLabels[session.role]}</span>
								<AgentStateBadge state={session.state} />
								{session.openUrl !== null && <OpenInSuperset url={session.openUrl} />}
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
		</Row>
	);
}
