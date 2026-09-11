import { useQuery } from "@tanstack/react-query";
import type { AgentRun } from "@trellis/api";
import { Avatar, Button } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { AgentRunSheet } from "../AgentRunSheet";
import { AgentSessions } from "./components/AgentSessions";
import { PersonaPicker } from "./components/PersonaPicker";

// True while an agent still holds the ticket: it starts up, it works, or it
// waits for an answer. The Agent section puts a green dot on the picture of
// every such agent, and one ticket can hold more than one of them.
const atWork = (run: AgentRun) => run.state === "starting" || run.state === "running" || run.state === "interrupted";

// A person calls an agent by one name. Agents the server named before it
// dropped surnames still carry two words, so the row takes the first one.
const shortName = (name: string) => name.split(" ")[0]!;

// The agent side of a ticket, under one heading: the runs the manager
// started, the persona picker, and the builder and reviewer sessions.
export function TicketAgent({ ticket, disabled = false }: { ticket: string; disabled?: boolean }) {
	const { orpc } = useApp();
	const query = useQuery(orpc.agentRuns.list.queryOptions({ input: { ticket }, retry: false }));
	const [openId, setOpenId] = useState<string | null>(null);
	const runs = query.data ?? [];
	const working = runs.filter(atWork);
	// agentRuns.list gives the newest run first. When no agent works, the row
	// keeps the newest one, so its output and its error stay one click away.
	const shown = working.length > 0 ? working : runs.slice(0, 1);
	const open = runs.find((run) => run.id === openId) ?? null;
	return (
		<section aria-label="Agent assignment" className="flex flex-col border-t border-border pt-3 pb-1">
			<h3 className="mb-1 text-xs font-medium text-fg-faint">Agent</h3>
			{query.isPending ? (
				<p role="status" className="text-sm text-fg-faint">
					Load agents…
				</p>
			) : query.isError ? (
				<p role="alert" className="text-sm text-danger">
					Could not load agents.{" "}
					<Button variant="quiet" onClick={() => void query.refetch()}>
						Retry
					</Button>
				</p>
			) : (
				<>
					{shown.map((run) => (
						<Button
							key={run.id}
							variant="quiet"
							align="start"
							aria-label={`${shortName(run.name)} · ${run.kind}`}
							className="-ml-2.5 justify-start"
							onClick={() => setOpenId(run.id)}
						>
							<span className="flex min-w-0 items-center gap-2">
								<Avatar kind="agent" name={run.name} live={atWork(run)} />
								<span className="truncate text-fg">{shortName(run.name)}</span>
								<span className="text-xs text-fg-faint">{run.kind}</span>
								{run.state === "failed" && <span className="text-xs text-danger">failed</span>}
							</span>
						</Button>
					))}
					<PersonaPicker ticket={ticket} disabled={disabled} />
				</>
			)}
			<AgentSessions identifier={ticket} />
			{open && <AgentRunSheet run={open} onClose={() => setOpenId(null)} />}
		</section>
	);
}
