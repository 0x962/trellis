import { Copy } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { UsageMetric, UsageSession } from "@trellis/api";
import {
	Button,
	EmptyState,
	formatWhen,
	IconButton,
	SectionHeader,
	TicketId,
	Tooltip,
	toast,
	writeClipboard,
} from "@trellis/ui";
import { useState } from "react";
import { formatMetric, harnessLabel } from "../../../formatUsage";

export type UsageSessionsProps = {
	sessions: readonly UsageSession[];
	metric: UsageMetric;
	// The label of the selected breakdown row, when one filters the list.
	filtered: string | null;
};

// How many sessions show at first, and how many each Show more adds.
const PAGE = 10;

const kindLabel: Record<string, string> = {
	agent: "Agent",
	flow: "Flow",
	session: "Session",
};

// The agent that ran the session, such as "Code Reviewer · Agent". A
// session that Trellis did not start has no agent, so the cell names the
// harness that ran it, such as "Claude Code".
const agentOrHarness = (session: UsageSession) =>
	session.run
		? `${session.run.name} · ${kindLabel[session.run.kind] ?? session.run.kind}`
		: harnessLabel[session.harness];

// The top sessions for the selected metric. A session that Trellis started
// names its ticket, agent, and kind. The session id copies for
// `claude --resume`, `codex resume`, or `muse resume`.
export function UsageSessions({ sessions, metric, filtered }: UsageSessionsProps) {
	const [shown, setShown] = useState(PAGE);
	const visible = sessions.slice(0, shown);
	const copy = async (id: string) => {
		try {
			await writeClipboard(id);
			toast("Session id copied");
		} catch (error) {
			toast(error instanceof Error ? error.message : "Could not copy the session id.");
		}
	};
	return (
		<section aria-label="Sessions" className="flex flex-col gap-3">
			<SectionHeader
				title={filtered === null ? "Top sessions" : `Top sessions in ${filtered}`}
				count={sessions.length}
			/>
			{sessions.length === 0 ? (
				<EmptyState
					title="No sessions"
					description="No session matches this selection. Clear the selected row or the selected day."
				/>
			) : (
				<>
					<table aria-label="Top sessions" className="w-full table-fixed border-collapse text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs text-fg-faint">
								<th scope="col" className="h-8 w-36 pr-3 font-medium">
									Last turn
								</th>
								<th scope="col" className="h-8 pr-3 font-medium">
									Session
								</th>
								<th scope="col" className="h-8 w-44 pr-3 font-medium max-md:hidden">
									Agent or harness
								</th>
								<th scope="col" className="h-8 w-40 pr-3 font-medium max-lg:hidden">
									Model
								</th>
								<th scope="col" className="h-8 w-24 pr-3 text-right font-medium">
									{metric === "usd" ? "Cost" : "Tokens"}
								</th>
								<th scope="col" className="h-8 w-9 font-medium">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{visible.map((session) => {
								const name = session.label ?? session.run?.ticketTitle ?? null;
								return (
									<tr
										key={session.sessionId}
										className="group h-9 border-b border-border transition-colors duration-hover ease-out hover:bg-band"
									>
										<td className="whitespace-nowrap pr-3 text-fg-muted tabular">{formatWhen(session.lastAt)}</td>
										<td className="max-w-0 pr-3">
											<div className="flex min-w-0 items-center gap-2">
												{session.run?.ticketIdentifier && (
													<Link
														to="/t/$identifier"
														params={{ identifier: session.run.ticketIdentifier }}
														className="shrink-0"
													>
														<TicketId id={session.run.ticketIdentifier} />
													</Link>
												)}
												{name === null ? (
													<span className="truncate font-mono text-fg tabular" title={session.sessionId}>
														{session.sessionId}
													</span>
												) : (
													<span className="truncate font-medium text-fg" title={name}>
														{name}
													</span>
												)}
											</div>
										</td>
										<td className="max-w-0 pr-3 text-fg-muted max-md:hidden">
											<span className="block truncate" title={agentOrHarness(session)}>
												{agentOrHarness(session)}
											</span>
										</td>
										<td className="max-w-0 pr-3 text-fg-muted max-lg:hidden">
											<span className="block truncate font-mono" title={session.model}>
												{session.model}
											</span>
										</td>
										<td className="whitespace-nowrap pr-3 text-right text-fg tabular">
											{session.approximate && metric === "usd" ? "~" : ""}
											{formatMetric(metric, session[metric])}
										</td>
										<td>
											<Tooltip content="Copy session id">
												<IconButton
													label={`Copy session id ${session.sessionId}`}
													icon={<Copy />}
													className="opacity-0 transition-opacity duration-hover ease-out group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
													onClick={() => void copy(session.sessionId)}
												/>
											</Tooltip>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{sessions.length > shown && (
						<div className="flex justify-start">
							<Button size="sm" variant="quiet" onClick={() => setShown((count) => count + PAGE)}>
								Show {Math.min(PAGE, sessions.length - shown)} more of {sessions.length}
							</Button>
						</div>
					)}
				</>
			)}
		</section>
	);
}
