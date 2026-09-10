import { ORPCError } from "@orpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, type ErrorComponentProps, Link } from "@tanstack/react-router";
import { TicketRefStringSchema } from "@trellis/api";
import { Avatar, Button, EmptyState, PriorityIcon, StatusIcon, TicketId, toast } from "@trellis/ui";
import { Copy } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { Breadcrumb } from "../../../features/shell/Breadcrumb";
import { NotFoundState } from "../../../features/shell/NotFoundState";
import { Topbar } from "../../../features/shell/Topbar";
import { ReadOnlyMarkdown } from "../../../features/ticket/ReadOnlyMarkdown";
import { type AppContext, useApp } from "../../../lib/appContext";
import { relativeTime } from "../../../lib/format";
import { projectSlashPath } from "../../../lib/projectPath";

// The URL may carry any case; the API call and the page use the canonical
// identifier.
const ticketOptions = (context: AppContext, identifier: string) =>
	context.orpc.tickets.get.queryOptions({ input: { ticket: TicketRefStringSchema.parse(identifier) } });

// The full ticket page.
export const Route = createFileRoute("/t/$identifier")({
	loader: ({ context, params }) => context.queryClient.ensureQueryData(ticketOptions(context, params.identifier)),
	component: TicketPage,
	errorComponent: TicketError,
});

function Property({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex h-7 items-center gap-3">
			<dt className="w-20 shrink-0 text-sm text-fg-muted">{label}</dt>
			<dd className="flex min-w-0 items-center gap-1.5 text-sm text-fg">{children}</dd>
		</div>
	);
}

function TicketPage() {
	const { identifier } = Route.useParams();
	const context = useApp();
	const ticket = useSuspenseQuery(ticketOptions(context, identifier)).data;
	// `system` is the server itself and never shows as an actor.
	const { lastActor } = ticket;

	useEffect(() => {
		document.title = `${ticket.identifier} · ${ticket.title}`;
		return () => {
			document.title = "trellis";
		};
	}, [ticket.identifier, ticket.title]);

	const copyId = async () => {
		await navigator.clipboard.writeText(ticket.identifier);
		toast(`Copied ${ticket.identifier}`);
	};

	return (
		<>
			<Topbar
				actions={
					<Button icon={<Copy />} onClick={copyId}>
						Copy ID
					</Button>
				}
			>
				<Breadcrumb path={ticket.project.path} />
				<span aria-hidden="true" className="text-fg-faint">
					·
				</span>
				<TicketId id={ticket.identifier} />
				{ticket.parent !== null && (
					<Link
						to="/t/$identifier"
						params={{ identifier: ticket.parent.identifier }}
						className="inline-flex h-5 items-center rounded-sm border border-border bg-surface px-1.5 font-mono text-xs text-fg-muted hover:text-fg"
					>
						↳ {ticket.parent.identifier}
					</Link>
				)}
			</Topbar>
			<div className="flex min-h-0 flex-1">
				<article className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
					<h1 className="text-xl font-semibold text-fg">{ticket.title}</h1>
					<ReadOnlyMarkdown markdown={ticket.description} className="mt-4" />
					{ticket.children.length > 0 && (
						<section className="mt-8">
							<h2 className="text-sm font-medium text-fg-muted tabular">
								Sub-tickets · {ticket.childDoneCount}/{ticket.childCount} done
							</h2>
							<ul className="mt-2 flex flex-col">
								{ticket.children.map((child) => (
									<li key={child.id}>
										<Link
											to="/t/$identifier"
											params={{ identifier: child.identifier }}
											className="flex h-8 items-center gap-3 rounded-md px-2 text-fg hover:bg-surface"
										>
											<StatusIcon category={child.status.category} reviewer={child.status.reviewer ?? undefined} />
											<TicketId id={child.identifier} />
											<span className="truncate">{child.title}</span>
										</Link>
									</li>
								))}
							</ul>
						</section>
					)}
					{ticket.prs.length > 0 && (
						<section className="mt-8">
							<h2 className="text-sm font-medium text-fg-muted tabular">Pull requests · {ticket.prs.length}</h2>
							<ul className="mt-2 flex flex-col gap-1">
								{ticket.prs.map((pr) => (
									<li key={pr.id} className="flex h-8 items-center gap-3 text-fg">
										<span className="font-mono text-sm text-fg-muted">
											{pr.owner}/{pr.repo} #{pr.number}
										</span>
										<span className="truncate">{pr.title}</span>
									</li>
								))}
							</ul>
						</section>
					)}
				</article>
				<aside aria-label="Properties" className="w-70 shrink-0 border-l border-border px-5 py-6">
					<dl className="flex flex-col gap-1">
						<Property label="Status">
							<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? undefined} />
							{ticket.status.name}
						</Property>
						<Property label="Priority">
							<PriorityIcon priority={ticket.priority} />
							<span className="capitalize">{ticket.priority}</span>
						</Property>
						<Property label="Project">
							<Link to="/p/$" params={{ _splat: projectSlashPath(ticket.project.path) }} className="hover:underline">
								{projectSlashPath(ticket.project.path)}
							</Link>
						</Property>
						<Property label="Parent">
							{ticket.parent === null ? (
								<span className="text-fg-faint">None</span>
							) : (
								<Link to="/t/$identifier" params={{ identifier: ticket.parent.identifier }} className="hover:underline">
									{ticket.parent.identifier}
								</Link>
							)}
						</Property>
						<Property label="Last actor">
							{lastActor === null || lastActor.kind === "system" ? (
								<span className="text-fg-faint">None</span>
							) : (
								<>
									<Avatar kind={lastActor.kind} name={lastActor.name} />
									{lastActor.name}
								</>
							)}
						</Property>
						<Property label="Created">
							<span className="tabular">{relativeTime(ticket.createdAt)}</span>
						</Property>
						<Property label="Updated">
							<span className="tabular">{relativeTime(ticket.updatedAt)}</span>
						</Property>
					</dl>
				</aside>
			</div>
		</>
	);
}

// The API said no. NOT_FOUND names the identifier; anything else shows its message.
function TicketError({ error }: ErrorComponentProps) {
	if (error instanceof ORPCError && error.code === "NOT_FOUND") {
		const { ref } = error.data as { ref: string };
		return (
			<>
				<Topbar>
					<TicketId id={ref} />
				</Topbar>
				<NotFoundState ref={ref} searchFor={ref} />
			</>
		);
	}
	return (
		<EmptyState
			title="Something went wrong"
			description={error instanceof Error ? error.message : String(error)}
			className="flex-1 justify-center"
		/>
	);
}
