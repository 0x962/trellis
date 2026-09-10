import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { Command, Kbd } from "@trellis/ui";
import { type KeyboardEvent, useEffect, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { projectRefOfPathname } from "../../../../../lib/projectPath";
import { currentPlatform, formatShortcut } from "../../../../../lib/shortcuts";
import { commandActions, useCommandStore } from "../../../commandStore";
import { useActionContext } from "../../../hooks/useActionContext";
import { useCommandSearch } from "../../../hooks/useCommandSearch";
import type { PaletteGroup, PaletteRow, RowDeps, Submenu } from "../../../rows";
import { paletteTypeahead } from "../../../typeahead";
import { jumpRow, resultRows } from "../../../utils/resultRows";
import { submenuHeadings } from "../../../utils/submenuRows";
import { selectionRows, ticketRows } from "../../../utils/ticketRows";
import { createRows, gotoRows, viewRows } from "../../../utils/viewRows";
import { SubmenuGroup } from "../SubmenuGroup";

export type PalettePanelProps = {
	// The ticket the This ticket section acts on.
	identifier: string | null;
	ticket: Ticket | undefined;
	submenu: Submenu | null;
	onSubmenu: (submenu: Submenu | null) => void;
};

const placeholders = {
	commands: "Type a command or search tickets",
	search: "Search tickets",
	projects: "Go to a project",
};

// A row answers the typed text when every typed word starts a word of its
// label: "toggle the" names Toggle theme.
const rowMatches = (label: string, typed: string) => {
	if (typed === "") return false;
	const words = label.toLowerCase().split(/[^a-z0-9]+/);
	return typed
		.toLowerCase()
		.split(/\s+/)
		.every((needle) => words.some((word) => word.startsWith(needle)));
};

const selectionHeading = (count: number) => (
	<>
		Selection <span className="text-fg-muted">{count === 1 ? "1 ticket" : `${count} tickets`}</span>
	</>
);

// cmdk moves an option in the DOM when it ranks the list, so every option
// stays a direct child of its group.
const drawRows = (rows: PaletteRow[]) =>
	rows.map((row) => (
		<Command.Row
			key={row.value}
			value={row.value}
			label={row.label}
			sub={row.sub}
			mono={row.mono}
			keys={row.keys}
			icon={row.icon}
			keywords={row.keywords}
			onSelect={row.run}
		/>
	));

// The panel of the palette: the field, the sections for the context under
// it, and the results of the typed query. It mounts when the palette
// opens, so every keystroke it holds is gone the next time.
export function PalettePanel({ identifier, ticket, submenu, onSubmenu }: PalettePanelProps) {
	const { orpc } = useApp();
	const mode = useCommandStore((state) => state.mode);
	const selection = useCommandStore((state) => state.selection);
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
	const action = useActionContext();
	const projects = useSuspenseQuery(orpc.projects.list.queryOptions({ input: {} })).data;
	const [query, setQuery] = useState("");
	const [value, setValue] = useState("");

	// The keys typed between Cmd+K and the focus of the field join the query.
	useEffect(() => paletteTypeahead.attach(setQuery), []);

	// A submenu and the project picker list their own values, so neither
	// searches tickets.
	const results = useCommandSearch(submenu === null && mode !== "projects" ? query : "");

	const deps: RowDeps = {
		action,
		ticket,
		identifier,
		selection,
		projects,
		pathname,
		search,
		routeProject: projectRefOfPathname(pathname),
		// The typed words named the command, and a submenu filters its
		// choices by the field, so the field starts empty there.
		openSubmenu: (next) => {
			setQuery("");
			onSubmenu(next);
		},
		close: commandActions.close,
	};

	const groups: PaletteGroup[] = [];
	if (submenu === null && mode === "commands") {
		if (identifier !== null) groups.push({ id: "ticket", heading: "This ticket", rows: ticketRows(deps) });
		if (selection.length > 0) {
			groups.push({ id: "selection", heading: selectionHeading(selection.length), rows: selectionRows(deps) });
		}
		groups.push({ id: "create", heading: "Create", rows: createRows(deps) });
		groups.push({ id: "goto", heading: "Go to", rows: gotoRows(deps) });
		groups.push({ id: "view", heading: "View", rows: viewRows(deps) });
	}
	if (submenu === null && mode === "projects") {
		groups.push({
			id: "goto",
			heading: "Go to",
			rows: gotoRows(deps).filter((row) => row.value.startsWith("goto.project.")),
		});
	}
	if (submenu === null && results.tickets.length > 0) {
		groups.push({ id: "results", heading: "Search results", rows: resultRows(results.tickets, deps) });
	}

	// The footer hint names a root key that exists: the key of the ticket in
	// context, then the root of the route's project, then the first root.
	const hintKey =
		identifier?.split("-")[0] ??
		deps.routeProject?.split(".")[0] ??
		projects.filter((row) => row.depth === 0).sort((a, b) => a.position - b.position)[0]!.key;

	const typed = query.trim();
	const named = groups
		.filter((group) => group.id !== "results")
		.flatMap((group) => group.rows)
		.find((row) => rowMatches(row.label, typed));
	// What Enter runs: the ticket an identifier names, then a command the
	// typed words name, then the closest ticket. An arrow key moves on from
	// here, and the next keystroke answers again.
	const best = typed === "" ? undefined : (results.jump ?? named?.value ?? results.tickets[0]?.identifier);
	const nothing = typed !== "" && best === undefined;

	useEffect(() => {
		if (best !== undefined) setValue(best);
	}, [best]);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		action.navigate(typed === "" ? "/search" : `/search?q=${encodeURIComponent(typed)}`);
		commandActions.close();
	};

	return (
		<Command.Root
			label="Command menu"
			value={value}
			onValueChange={setValue}
			shouldFilter={submenu !== null}
			className="min-h-0"
		>
			<Command.Field
				placeholder={submenu === null ? placeholders[mode] : submenuHeadings[submenu.kind]}
				context={identifier ?? undefined}
				value={query}
				onValueChange={setQuery}
				onKeyDown={onKeyDown}
				autoFocus
			/>
			<Command.List>
				{results.jump !== null && drawRows([jumpRow(results.jump, deps)])}
				{submenu !== null && <SubmenuGroup submenu={submenu} deps={deps} />}
				{groups.map((group) => (
					<Command.Group key={group.id} heading={group.heading}>
						{drawRows(group.rows)}
					</Command.Group>
				))}
				{nothing && <Command.Empty>No results</Command.Empty>}
			</Command.List>
			<Command.Footer>
				<span className="flex items-center gap-1.5">
					<Kbd>↑↓</Kbd> move
				</span>
				<span className="flex items-center gap-1.5">
					<Kbd>↵</Kbd> run
				</span>
				<span className="flex items-center gap-1.5">
					{formatShortcut("mod+enter", currentPlatform()).map((cap) => (
						<Kbd key={cap}>{cap}</Kbd>
					))}
					open full search
				</span>
				<span className="ml-auto">
					Type <span className="font-mono">{hintKey}-12</span> to jump to a ticket
				</span>
			</Command.Footer>
		</Command.Root>
	);
}
