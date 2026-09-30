import { CheckCircle, Plus, Rows, SidebarSimple } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { CreatedTicket, Scenario } from "../../../model";
import { IconButton, StatusIcon, Tooltip, TrellisMark } from "../../../ui";
import { Composer } from "../Composer";
import { useComposer } from "../useComposer";

export function Preview({ scenario, embedded = false }: { scenario: Scenario; embedded?: boolean }) {
	const [open, setOpen] = useState(true);
	const [created, setCreated] = useState<CreatedTicket[]>([]);
	const opener = useRef<HTMLButtonElement>(null);
	const state = useComposer(scenario, (ticket) => {
		setCreated((prior) => [...prior, ticket]);
		if (!state.keepOpen) setOpen(false);
	});
	return (
		<div className={`preview-workspace ${embedded ? "embedded-workspace" : ""}`}>
			<aside className="workspace-sidebar" aria-hidden="true">
				<div className="workspace-brand">
					<TrellisMark className="size-5" />
					<strong>Trellis</strong>
					<SidebarSimple size={16} />
				</div>
				<p className="workspace-label">Workspace</p>
				<div className="workspace-nav">My tickets</div>
				<div className="workspace-nav">Sessions</div>
				<p className="workspace-label">Projects</p>
				<div className="workspace-nav current">
					<span className="project-key">TRL</span>Trellis
				</div>
				<div className="workspace-nav nested">Tickets</div>
				<div className="workspace-nav nested selected">September 29 review</div>
			</aside>
			<main className="workspace-content">
				<div className="workspace-topbar">
					<span>
						Trellis <span className="breadcrumb-slash">/</span> September 29 review
					</span>
					<Tooltip content="New ticket">
						<IconButton ref={opener} label="New ticket" icon={<Plus />} onClick={() => setOpen(true)} />
					</Tooltip>
				</div>
				<div className="workspace-title">
					<h1>September 29 review</h1>
					<p>Refine the details of everyday work.</p>
				</div>
				<div className="workspace-list-header">
					<span>
						<Rows size={14} /> Tickets
					</span>
					<span>{21 + created.length}</span>
				</div>
				{[
					"Open tab actions from the tab menu",
					"Improve the pull request actions",
					"Refine the create ticket dialog",
				].map((title, index) => (
					<div className="workspace-ticket" key={title}>
						<StatusIcon category="todo" />
						<span className="ticket-id">TRL-{1241 + index * 4}</span>
						<span>{title}</span>
					</div>
				))}
				{created.map((ticket, index) => (
					<div className="workspace-ticket created-ticket" key={ticket.id}>
						<StatusIcon category={ticket.assigned ? "started" : "todo"} />
						<span className="ticket-id">PREVIEW-{index + 1}</span>
						<span>{ticket.title}</span>
						<span className="created-agent">{ticket.assigned ? ticket.agent : "Unassigned"}</span>
					</div>
				))}
				{created.length > 0 && (
					<div role="status" className="creation-receipt">
						<CheckCircle size={18} />
						<div>
							<strong>{created.length === 1 ? "Ticket created" : `${created.length} tickets created`}</strong>
							<p>
								{created.at(-1)?.assigned
									? `Assigned to ${created.at(-1)?.agent} with ${created.at(-1)?.model}.`
									: "The ticket is ready to assign later."}
							</p>
						</div>
					</div>
				)}
				{!open && (state.title || state.description) && (
					<div role="status" className="draft-receipt">
						Draft saved. Open New ticket to continue.
					</div>
				)}
			</main>
			<Composer open={open} onClose={() => setOpen(false)} opener={opener} state={state} embedded={embedded} />
		</div>
	);
}
