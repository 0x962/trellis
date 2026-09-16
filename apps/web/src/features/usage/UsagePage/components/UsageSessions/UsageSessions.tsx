import { Copy } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { UsageMetric, UsageSession } from "@trellis/api";
import { Button, IconButton, SectionHeader, TicketId, Tooltip, toast } from "@trellis/ui";
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

const formatWhen = (iso: string) =>
	new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const kindLabel: Record<string, string> = { builder: "Builder", reviewer: "Reviewer", manager: "Manager" };

// The most expensive sessions of the range. A session that Trellis started
// names its ticket, persona, and kind. The session id copies for
// `claude --resume` or `codex resume`.
export function UsageSessions({ sessions, metric, filtered }: UsageSessionsProps) {
	const [shown, setShown] = useState(PAGE);
	const visible = sessions.slice(0, shown);
	const copy = async (id: string) => {
		try {
			await navigator.clipboard.writeText(id);
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
				actions={<span>By cost, the most expensive first</span>}
			/>
			{sessions.length === 0 ? (
				<p className="border border-dashed border-border p-4 text-sm text-fg-faint">
					No session matches this selection.
				</p>
			) : (
				<>
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs text-fg-faint">
								<th scope="col" className="h-8 w-32 pr-3 font-medium">
									Last turn
								</th>
								<th scope="col" className="h-8 pr-3 font-medium">
									Session
								</th>
								<th scope="col" className="h-8 w-44 pr-3 font-medium max-md:hidden">
									Agent
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
							{visible.map((session) => (
								<tr key={session.sessionId} className="h-9 border-b border-border hover:bg-elevated">
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
											<span className="truncate text-fg">
												{session.label ?? session.run?.ticketTitle ?? session.sessionId}
											</span>
										</div>
									</td>
									<td className="max-w-0 pr-3 text-fg-muted max-md:hidden">
										<span className="block truncate">
											{session.run
												? `${session.run.persona} · ${kindLabel[session.run.kind] ?? session.run.kind}`
												: harnessLabel[session.harness]}
										</span>
									</td>
									<td className="max-w-0 pr-3 text-fg-muted max-lg:hidden">
										<span className="block truncate font-mono text-xs">{session.model}</span>
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
												onClick={() => void copy(session.sessionId)}
											/>
										</Tooltip>
									</td>
								</tr>
							))}
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
