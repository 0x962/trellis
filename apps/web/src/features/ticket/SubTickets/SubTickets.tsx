import type { Ticket, TicketSummary } from "@trellis/api";
import { Avatar, CheckRibbon, PriorityIcon, StatusIcon, TicketId } from "@trellis/ui";
import { GitPullRequestArrow } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { compactRelativeTime } from "../../../lib/format";
import { useOpenTicket } from "../hooks/useOpenTicket";
import { failToast } from "../utils/failToast";
import { summaryOf } from "../utils/summaryOf";

export type SubTicketsProps = {
	ticket: Ticket;
	// The add field takes focus on mount, for the rail's Add.
	autoFocusAdd?: boolean;
};

type Pending = { key: number; title: string };

const rowClass = "flex h-9 w-full items-center gap-3 border-b border-border px-3 text-base text-fg";

// The check segments a child's PR badge stands for: the counts, in bucket order.
const badgeChecks = (pr: NonNullable<TicketSummary["pr"]>) => [
	...Array.from({ length: pr.fail }, () => ({ name: "failing", bucket: "fail" as const })),
	...Array.from({ length: pr.pending }, () => ({ name: "pending", bucket: "pending" as const })),
	...Array.from({ length: pr.pass }, () => ({ name: "passing", bucket: "pass" as const })),
];

// The children of a ticket: a progress bar, one fixed-height row per child,
// and an add field. A new child shows at once and takes its number when the
// server answers.
export function SubTickets({ ticket, autoFocusAdd = false }: SubTicketsProps) {
	const { client, orpc, queryClient } = useApp();
	const open = useOpenTicket();
	const [pending, setPending] = useState<Pending[]>([]);
	const [draft, setDraft] = useState("");
	const addField = useRef<HTMLInputElement>(null);
	const done = ticket.children.filter((child) => child.status.category === "done").length;
	const total = ticket.children.length;
	const fill = total === 0 ? 0 : (done / total) * 100;

	useEffect(() => {
		if (autoFocusAdd) addField.current?.focus();
	}, [autoFocusAdd]);

	const create = async (title: string) => {
		const key = Date.now() + Math.random();
		setPending((rows) => [...rows, { key, title }]);
		try {
			const created = await client.tickets.create({ project: ticket.project.path, parent: ticket.identifier, title });
			queryClient.setQueryData<Ticket>(orpc.tickets.get.queryKey({ input: { ticket: ticket.identifier } }), (data) =>
				data === undefined
					? data
					: { ...data, children: [...data.children, summaryOf(created)], childCount: data.childCount + 1 },
			);
		} catch (error) {
			setDraft(title);
			failToast(`The sub-ticket of ${ticket.identifier} is not created.`, error, () => void create(title));
		} finally {
			setPending((rows) => rows.filter((row) => row.key !== key));
		}
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		const title = draft.trim();
		if (title === "") return;
		setDraft("");
		void create(title);
	};

	return (
		<section aria-label="Sub-tickets" className="flex flex-col gap-2">
			<header className="flex h-7 items-center gap-2 text-base font-medium text-fg">
				Sub-tickets
				<span className="font-normal text-fg-faint tabular">
					{done} of {total} done
				</span>
			</header>
			<div className="overflow-hidden rounded-md border border-border">
				<div
					role="progressbar"
					aria-label="Sub-tickets done"
					aria-valuemin={0}
					aria-valuemax={total}
					aria-valuenow={done}
					className="h-0.75 bg-border"
				>
					<div data-fill="" style={{ width: `${fill.toFixed(2)}%` }} className="h-full bg-success" />
				</div>
				<ul>
					{ticket.children.map((child) => (
						<li key={child.id}>
							<ChildRow child={child} onOpen={() => open(child.identifier)} />
						</li>
					))}
					{pending.map((row) => (
						<li key={row.key} className={rowClass}>
							<StatusIcon category="todo" />
							<TicketId id="…" className="w-16" />
							<span className="min-w-0 flex-1 truncate">{row.title}</span>
						</li>
					))}
				</ul>
				<div className="flex h-9 items-center px-3">
					<input
						ref={addField}
						aria-label="New sub-ticket"
						placeholder="New sub-ticket"
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={onKeyDown}
						className="h-7 w-full rounded-sm bg-transparent text-base text-fg outline-none placeholder:text-fg-faint focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
					/>
				</div>
			</div>
		</section>
	);
}

function ChildRow({ child, onOpen }: { child: TicketSummary; onOpen: () => void }) {
	const { status, lastActor, pr } = child;
	return (
		<button
			type="button"
			onClick={onOpen}
			className={`${rowClass} text-left transition-colors duration-hover hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
		>
			<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />
			<TicketId id={child.identifier} className="w-16" />
			<span className="min-w-0 flex-1 truncate">{child.title}</span>
			<PriorityIcon priority={child.priority} />
			<span className="flex w-16 shrink-0 items-center gap-1">
				{pr !== null && (
					<span
						role="img"
						aria-label={`${pr.state} pull request, CI ${pr.ciState}`}
						className="inline-flex items-center gap-1 text-fg-muted"
					>
						<GitPullRequestArrow className="size-3.5" aria-hidden="true" />
						<CheckRibbon size="mini" checks={badgeChecks(pr)} />
					</span>
				)}
			</span>
			<span className="flex w-5 shrink-0 justify-center">
				{lastActor !== null && lastActor.kind !== "system" && <Avatar kind={lastActor.kind} name={lastActor.name} />}
			</span>
			<time dateTime={child.updatedAt} className="w-8 shrink-0 text-right text-sm text-fg-faint tabular">
				{compactRelativeTime(child.updatedAt)}
			</time>
		</button>
	);
}
