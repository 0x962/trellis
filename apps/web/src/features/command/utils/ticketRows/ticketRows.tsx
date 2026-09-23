import {
	ArrowElbowDownRight,
	ArrowSquareOut,
	Copy,
	Flag,
	FolderSimple,
	GitPullRequest,
	Link,
	ListChecks,
	Stack,
	Tag,
	Trash,
	X,
} from "@phosphor-icons/react";
import { PriorityIcon, StatusIcon } from "@trellis/ui";
import type { ReactNode } from "react";
import { labelNames } from "../../../../lib/labelNames";

import { pageSheetActions } from "../../../../stores/pageSheetStore";
import { composerActions } from "../../../composer";
import { epicState } from "../../../table/utils/epicState";
import { labelStates } from "../../../table/utils/labelStates";
import {
	branchName,
	copyAgentBrief,
	copyBranchName,
	copyId,
	copyIds,
	copyLink,
	copyLinks,
	deleteTicket,
	openPullRequest,
} from "../../actions";
import { itemsOfSection } from "../../items";
import { capsOf, type PaletteRow, priorityLabels, type RowDeps, statusProject } from "../../rows";

// The This ticket section and the Selection section. Both act through the
// same actions, on one ticket or on every selected row.

const icons: Record<string, ReactNode> = {
	"ticket.project": <FolderSimple />,
	"ticket.parent": <ArrowElbowDownRight />,
	"ticket.labels": <Tag />,
	"ticket.subTicket": <ArrowElbowDownRight />,
	"ticket.copyId": <Copy />,
	"ticket.copyBranch": <Copy />,
	"ticket.copyBrief": <Copy />,
	"ticket.copyLink": <Copy />,
	"ticket.open": <ArrowSquareOut />,
	"ticket.delete": <Trash />,
	"selection.project": <FolderSimple />,
	"selection.parent": <ArrowElbowDownRight />,
	"selection.epic": <Stack />,
	"selection.wave": <Flag />,
	"selection.labels": <Tag />,
	"selection.copyIds": <Copy />,
	"selection.copyLinks": <Link />,
	"selection.delete": <Trash />,
	"selection.selectAll": <ListChecks />,
	"selection.clear": <X />,
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
	const subs: Record<string, string | undefined> = {
		"ticket.status": ticket?.status.name,
		"ticket.priority": ticket === undefined ? undefined : priorityLabels[ticket.priority],
		"ticket.project": ticket === undefined ? undefined : ticket.project.key,
		"ticket.parent": ticket?.parent?.identifier,
		"ticket.labels": ticket === undefined || ticket.labels.length === 0 ? undefined : labelNames(ticket.labels),
		"ticket.copyId": identifier,
		"ticket.copyBranch": branch,
	};
	const mono = new Set(["ticket.copyId"]);
	// The branch name needs the title. A palette opened before the ticket
	// answered reads it here.
	const copyBranch = async () => {
		const full = ticket ?? (await action.client.tickets.get({ ticket: identifier }));
		await copyBranchName(action, full);
	};
	const runs: Record<string, () => void> = {
		"ticket.status": () => deps.openSubmenu({ kind: "status", tickets: [identifier], project: statusProject(deps) }),
		"ticket.priority": () => deps.openSubmenu({ kind: "priority", tickets: [identifier] }),
		"ticket.parent": () => deps.openSubmenu({ kind: "parent", tickets: [identifier], project: statusProject(deps) }),
		"ticket.labels": () =>
			deps.openSubmenu({
				kind: "labels",
				tickets: [identifier],
				project: statusProject(deps),
				checked: (ticket?.labels ?? []).map((label) => label.id),
				mixed: [],
			}),
		"ticket.subTicket": run(deps, () => composerActions.open({ parent: identifier, project: ticket?.project.key })),
		"ticket.copyId": run(deps, () => void copyId(action, identifier)),
		"ticket.copyBranch": run(deps, () => void copyBranch()),
		"ticket.copyBrief": run(deps, () => void copyAgentBrief(action, identifier)),
		"ticket.copyLink": run(deps, () => void copyLink(action, identifier)),
		"ticket.open": run(deps, () => pageSheetActions.openTicket(identifier)),
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
		return ticket === undefined ? undefined : <StatusIcon category={ticket.status.category} />;
	}
	if (id === "ticket.priority") return ticket === undefined ? undefined : <PriorityIcon priority={ticket.priority} />;
	return icons[id];
};

// The Selection section. Every row acts on every selected ticket. A write
// takes the bulk path, which asks before a large change and reports what it
// changed. An empty selection has no section at all.
export const selectionRows = (deps: RowDeps): PaletteRow[] => {
	const { action, selection } = deps;
	if (selection.length === 0) return [];
	const identifiers = selection.map((row) => row.identifier);
	// The statuses and the labels a submenu offers come from the project of
	// the first selected row, and the epics come from the root of that
	// project. A selection that spans two projects still writes a value
	// that belongs to one of them.
	const project = selection[0]!.project.key;
	const labels = labelStates(selection);
	// A wave belongs to one epic. The Set wave row exists only when
	// every selected ticket belongs to the same epic, and its submenu lists
	// the waves of that epic.
	const waveEpic = epicState(selection).epicRef;
	const runs: Record<string, () => void> = {
		"selection.status": () => deps.openSubmenu({ kind: "status", tickets: identifiers, project, bulk: true }),
		"selection.priority": () => deps.openSubmenu({ kind: "priority", tickets: identifiers, bulk: true }),
		"selection.labels": () =>
			deps.openSubmenu({
				kind: "labels",
				tickets: identifiers,
				project,
				checked: labels.all,
				mixed: labels.some,
				bulk: true,
			}),
		"selection.parent": () => deps.openSubmenu({ kind: "parent", tickets: identifiers, project, bulk: true }),
		"selection.epic": () => deps.openSubmenu({ kind: "epic", tickets: identifiers, project: project, bulk: true }),
		"selection.wave": () => deps.openSubmenu({ kind: "wave", tickets: identifiers, epic: waveEpic!, bulk: true }),
		"selection.copyIds": run(deps, () => void copyIds(action, identifiers)),
		"selection.copyLinks": run(deps, () => void copyLinks(action, identifiers)),
		// The bulk path asks its own question before it deletes, and the
		// surface that owns the selection clears it after.
		"selection.delete": run(deps, () => void deps.bulk.remove(selection)),
		"selection.selectAll": run(deps, () => deps.selectionOwner?.selectAll()),
		"selection.clear": run(deps, () => deps.selectionOwner?.clear()),
	};
	const items = itemsOfSection("selection").filter((item) => item.id !== "selection.wave" || waveEpic !== undefined);
	return items.map((item) => ({
		value: item.id,
		label: item.label,
		keys: capsOf(item),
		icon: icons[item.id],
		run: runs[item.id]!,
	}));
};
