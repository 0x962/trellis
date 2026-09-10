import { PriorityIcon, StatusIcon } from "@trellis/ui";
import { Copy, CornerDownRight, ExternalLink, FolderInput, GitPullRequest, Play, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { projectSlashPath } from "../../../../lib/projectPath";
import { buildAgentCommand } from "../../../agent/StartWithAgent/utils/buildAgentCommand";
import { composerActions } from "../../../composer";
import {
	branchName,
	bulkDelete,
	copyAgentBrief,
	copyBranchName,
	copyId,
	copyLink,
	deleteTicket,
	openPullRequest,
	startWithAgent,
} from "../../actions";
import { itemsOfSection } from "../../items";
import { capsOf, type PaletteRow, priorityLabels, type RowDeps, statusProject } from "../../rows";

// The This ticket section and the Selection section. Both act through the
// same actions, on one ticket or on every selected row.

const icons: Record<string, ReactNode> = {
	"ticket.project": <FolderInput />,
	"ticket.parent": <CornerDownRight />,
	"ticket.subTicket": <CornerDownRight />,
	"ticket.agent": <Play />,
	"ticket.copyId": <Copy />,
	"ticket.copyBranch": <Copy />,
	"ticket.copyBrief": <Copy />,
	"ticket.copyLink": <Copy />,
	"ticket.open": <ExternalLink />,
	"ticket.delete": <Trash2 />,
	"selection.project": <FolderInput />,
	"selection.delete": <Trash2 />,
};

// The palette closes as soon as an action starts, so the page under it
// shows the result.
const run = (deps: RowDeps, action: () => void) => () => {
	deps.close();
	action();
};

export const ticketRows = (deps: RowDeps): PaletteRow[] => {
	const identifier = deps.identifier!;
	const { action, ticket } = deps;
	const branch = ticket === undefined ? undefined : branchName(ticket);
	const command = buildAgentCommand(action.settings.startWithAgentTemplate, identifier);
	const subs: Record<string, string | undefined> = {
		"ticket.status": ticket?.status.name,
		"ticket.priority": ticket === undefined ? undefined : priorityLabels[ticket.priority],
		"ticket.project": ticket === undefined ? undefined : projectSlashPath(ticket.project.path),
		"ticket.parent": ticket?.parent?.identifier,
		"ticket.agent": command,
		"ticket.copyId": identifier,
		"ticket.copyBranch": branch,
	};
	const mono = new Set(["ticket.agent", "ticket.copyId", "ticket.copyBranch"]);
	// The branch name needs the title. A palette opened before the ticket
	// answered reads it here.
	const copyBranch = async () => {
		const full = ticket ?? (await action.client.tickets.get({ ticket: identifier }));
		await copyBranchName(action, full);
	};
	const runs: Record<string, () => void> = {
		"ticket.status": () => deps.openSubmenu({ kind: "status", tickets: [identifier], project: statusProject(deps) }),
		"ticket.priority": () => deps.openSubmenu({ kind: "priority", tickets: [identifier] }),
		"ticket.project": () => deps.openSubmenu({ kind: "project", tickets: [identifier] }),
		"ticket.parent": () => deps.openSubmenu({ kind: "parent", ticket: identifier, project: statusProject(deps) }),
		"ticket.subTicket": run(deps, () => composerActions.open({ parent: identifier, project: ticket?.project.path })),
		"ticket.agent": run(deps, () => void startWithAgent(action, identifier)),
		"ticket.copyId": run(deps, () => void copyId(action, identifier)),
		"ticket.copyBranch": run(deps, () => void copyBranch()),
		"ticket.copyBrief": run(deps, () => void copyAgentBrief(action, identifier)),
		"ticket.copyLink": run(deps, () => void copyLink(action, identifier)),
		"ticket.open": run(deps, () => action.navigate(`/t/${identifier}`)),
		"ticket.delete": run(deps, () => void deleteTicket(action, identifier)),
	};
	const rows = itemsOfSection("ticket").map((item) => ({
		value: item.id,
		label: item.label,
		sub: subs[item.id],
		mono: mono.has(item.id),
		keys: capsOf(item),
		icon: iconOf(item.id, deps),
		run: runs[item.id]!,
	}));
	const prs = (ticket?.prs ?? []).map((pr) => ({
		value: `ticket.pr.${pr.id}`,
		label: `Open PR #${pr.number}`,
		sub: `${pr.owner}/${pr.repo}`,
		icon: <GitPullRequest />,
		run: run(deps, () => openPullRequest(action, pr.url)),
	}));
	// The spec lists the pull requests after Copy link and before the two
	// rows that leave the palette.
	const before = rows.findIndex((row) => row.value === "ticket.open");
	return [...rows.slice(0, before), ...prs, ...rows.slice(before)];
};

// The status and the priority rows carry the mark of their current value,
// so the palette shows the state it is about to change.
const iconOf = (id: string, deps: RowDeps): ReactNode => {
	const { ticket } = deps;
	if (id === "ticket.status") {
		return ticket === undefined ? undefined : (
			<StatusIcon category={ticket.status.category} reviewer={ticket.status.reviewer ?? "human"} />
		);
	}
	if (id === "ticket.priority") return ticket === undefined ? undefined : <PriorityIcon priority={ticket.priority} />;
	return icons[id];
};

export const selectionRows = (deps: RowDeps): PaletteRow[] => {
	const { action, selection } = deps;
	const runs: Record<string, () => void> = {
		"selection.status": () => deps.openSubmenu({ kind: "status", tickets: selection, project: statusProject(deps) }),
		"selection.priority": () => deps.openSubmenu({ kind: "priority", tickets: selection }),
		"selection.project": () => deps.openSubmenu({ kind: "project", tickets: selection }),
		"selection.delete": run(deps, () => void bulkDelete(action, selection)),
	};
	return itemsOfSection("selection").map((item) => ({
		value: item.id,
		label: item.label,
		keys: capsOf(item),
		icon: icons[item.id],
		run: runs[item.id]!,
	}));
};
