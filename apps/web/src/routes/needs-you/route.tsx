import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { Inbox, InboxSection } from "@trellis/api";
import { Badge, Kbd, StatusIcon } from "@trellis/ui";
import { X } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { Topbar } from "../../features/shell/Topbar";
import { useApp } from "../../lib/appContext";
import { formatCount, relativeTime } from "../../lib/format";
import { InboxRow } from "./components/InboxRow";
import { SectionHeader } from "./components/SectionHeader";

type SectionKey = keyof Inbox;

const inboxInput = {};
const startedInput = { category: ["started" as const] };

const isEmpty = (inbox: Inbox) =>
	inbox.review.total + inbox.failingCi.total + inbox.stalled.total + inbox.doneByAgentsToday.total === 0;

// The home inbox: what waits on a person. The topbar count is Review plus
// Failing CI, the two sections that need one.
export const Route = createFileRoute("/needs-you")({
	loader: async ({ context }) => {
		const { queryClient, orpc } = context;
		const [inbox] = await Promise.all([
			queryClient.ensureQueryData(orpc.inbox.get.queryOptions({ input: inboxInput })),
			queryClient.ensureQueryData(orpc.settings.get.queryOptions({})),
		]);
		if (isEmpty(inbox)) await queryClient.ensureQueryData(orpc.tickets.counts.queryOptions({ input: startedInput }));
	},
	component: NeedsYouPage,
});

type SectionSpec = { key: SectionKey; name: string; icon: ReactElement; hint?: ReactNode };

function NeedsYouPage() {
	const { orpc } = useApp();
	const inboxQuery = useSuspenseQuery(orpc.inbox.get.queryOptions({ input: inboxInput }));
	const inbox = inboxQuery.data;
	const settings = useSuspenseQuery(orpc.settings.get.queryOptions({})).data;
	const [open, setOpen] = useState<Record<SectionKey, boolean>>({
		review: true,
		failingCi: true,
		stalled: true,
		doneByAgentsToday: false,
	});
	const count = inbox.review.total + inbox.failingCi.total;

	const sections: SectionSpec[] = [
		{
			key: "review",
			name: "Review",
			icon: <StatusIcon category="review" />,
			hint: (
				<>
					<Kbd>a</Kbd> approve <Kbd>r</Kbd> send back
				</>
			),
		},
		{ key: "failingCi", name: "Failing CI", icon: <X className="text-danger" /> },
		{
			key: "stalled",
			name: "Stalled",
			icon: <StatusIcon category="started" />,
			hint: `no activity for ${settings.stalledHours}h`,
		},
		{
			key: "doneByAgentsToday",
			name: "Done by agents today",
			icon: <StatusIcon category="done" />,
			hint: open.doneByAgentsToday ? "Hide" : `Show ${formatCount(inbox.doneByAgentsToday.total)}`,
		},
	];

	return (
		<>
			<Topbar
				actions={
					<span className="text-sm text-fg-faint tabular">
						Fetched {relativeTime(new Date(inboxQuery.dataUpdatedAt).toISOString())}
					</span>
				}
			>
				<h1 className="flex items-center gap-2 text-md font-semibold text-fg">
					Needs you
					{count > 0 && <Badge tone="accent">{formatCount(count)}</Badge>}
				</h1>
			</Topbar>
			<div className="min-h-0 flex-1 overflow-y-auto">
				{isEmpty(inbox) ? (
					<EmptyInbox />
				) : (
					sections.map((section) => (
						<Section
							key={section.key}
							spec={section}
							section={inbox[section.key]}
							open={open[section.key]}
							onToggle={() => setOpen((state) => ({ ...state, [section.key]: !state[section.key] }))}
						/>
					))
				)}
			</div>
		</>
	);
}

function Section({
	spec,
	section,
	open,
	onToggle,
}: {
	spec: SectionSpec;
	section: InboxSection;
	open: boolean;
	onToggle: () => void;
}) {
	return (
		<section aria-label={spec.name}>
			<SectionHeader
				name={spec.name}
				count={section.total}
				icon={spec.icon}
				hint={spec.hint}
				open={open}
				onToggle={onToggle}
			/>
			{open && section.items.map((ticket) => <InboxRow key={ticket.id} ticket={ticket} />)}
		</section>
	);
}

// Nothing waits on a person. The line names what the agents hold.
function EmptyInbox() {
	const { orpc } = useApp();
	const started = useSuspenseQuery(orpc.tickets.counts.queryOptions({ input: startedInput })).data;
	return (
		<div className="flex h-full items-center justify-center">
			<p className="text-fg-muted">
				Nothing needs you. {formatCount(started.total)} {started.total === 1 ? "ticket" : "tickets"} in progress by
				agents.{" "}
				<Link
					to="/all"
					search={{ category: ["started"] }}
					className="text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
				>
					Show them
				</Link>
			</p>
		</div>
	);
}
