import { ArrowLeft } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { Button, CodeText, Command, FailureState, IconButton, Kbd, Spinner, Tooltip } from "@trellis/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { projectRefOfPathname } from "../../../../../lib/projectUrl";
import { currentPlatform, formatShortcut } from "../../../../../lib/shortcuts";
import type { BulkWrite } from "../../../../table/hooks/useBulkWrite";
import { commandActions, useCommandStore } from "../../../commandStore";
import { useActionContext } from "../../../hooks/useActionContext";
import { useCommandSearch } from "../../../hooks/useCommandSearch";
import type { PaletteGroup, PaletteRow, RowDeps, Submenu } from "../../../rows";
import { paletteTypeahead } from "../../../typeahead";
import { drawRows } from "../../../utils/drawRows";
import { jumpRow, ticketResultRows } from "../../../utils/resultRows";
import { submenuHeadings } from "../../../utils/submenuRows";
import { selectionRows, ticketRows } from "../../../utils/ticketRows";
import { createRows, gotoProjectRows, gotoRows, viewRows } from "../../../utils/viewRows";
import { SubmenuGroup } from "../SubmenuGroup";

export type PalettePanelProps = {
	// The ticket the This ticket section acts on.
	identifier: string | null;
	ticket: Ticket | undefined;
	submenu: Submenu | null;
	onSubmenu: (submenu: Submenu | null) => void;
	// The one path every Selection section write takes. It lives in the
	// component above this one, which stays mounted after the palette closes,
	// so its confirm dialog keeps the screen while the person answers.
	bulk: BulkWrite;
};

const placeholders = {
	commands: "Type a command or search tickets",
	search: "Search tickets",
	projects: "Go to a project",
};

const footerKeyClass = "text-fg-muted opacity-100!";
// A text answers the typed words when every typed word starts a word of
// it: "toggle the" names Toggle theme.
const textMatches = (text: string, typed: string) => {
	const words = text.toLowerCase().split(/[^a-z0-9]+/);
	return typed
		.toLowerCase()
		.split(/\s+/)
		.every((needle) => words.some((word) => word.startsWith(needle)));
};

// A row answers the typed words through its label or one of its keywords.
const rowMatches = (row: PaletteRow, typed: string) =>
	typed !== "" && [row.label, ...(row.keywords ?? [])].some((text) => textMatches(text, typed));

const selectionHeading = (count: number) => (
	<>
		Selection <span className="text-fg-muted">{count === 1 ? "1 ticket" : `${count} tickets`}</span>
	</>
);

// The panel of the palette: the field, the sections for the context under
// it, and the results of the typed query. It mounts when the palette
// opens, so every keystroke it holds is gone the next time.
//
// With no query, the panel lists This ticket, Selection, Create, Go to,
// and View. With a query, it lists matching tickets, commands, and projects.
// A group with no match stays hidden. The panel filters the rows,
// because the cmdk rank would move tickets from the top.
export function PalettePanel({ identifier, ticket, submenu, onSubmenu, bulk }: PalettePanelProps) {
	const { orpc } = useApp();
	const mode = useCommandStore((state) => state.mode);
	const fieldRef = useRef<HTMLInputElement>(null);
	const selection = useCommandStore((state) => state.selection);
	const selectionOwner = useCommandStore((state) => state.selectionOwner);
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
	const typed = query.trim();
	const fieldLabel = submenu === null ? placeholders[mode] : submenuHeadings[submenu.kind];

	const deps: RowDeps = {
		action,
		ticket,
		identifier,
		selection,
		bulk,
		selectionOwner,
		projects,
		pathname,
		search,
		routeProject: projectRefOfPathname(pathname),
		// The typed words named the command, and a submenu filters its
		// choices by the field, so the field starts empty there.
		openSubmenu: (next) => {
			setQuery("");
			setValue("");
			onSubmenu(next);
		},
		close: commandActions.close,
	};

	const commands: PaletteGroup[] = [];
	if (submenu === null && mode === "commands") {
		if (identifier !== null)
			commands.push({
				id: "ticket",
				heading: "This ticket",
				rows: ticketRows(deps),
			});
		if (selection.length > 0) {
			commands.push({ id: "selection", heading: selectionHeading(selection.length), rows: selectionRows(deps) });
		}
		commands.push({ id: "create", heading: "Create", rows: createRows(deps) });
		commands.push({ id: "goto", heading: "Go to", rows: gotoRows(deps) });
		commands.push({ id: "view", heading: "View", rows: viewRows(deps) });
	}

	const groups: PaletteGroup[] = [];
	if (submenu === null && mode === "projects") {
		groups.push({ id: "projects", heading: submenuHeadings.goto, rows: gotoProjectRows(deps) });
	} else if (submenu === null && typed === "") {
		groups.push(...commands);
	} else if (submenu === null) {
		if (results.tickets.length > 0) {
			groups.push({ id: "results", heading: "Tickets", rows: ticketResultRows(results.tickets, deps) });
		}
		for (const group of commands) {
			const rows = group.rows.filter((row) => rowMatches(row, typed));
			if (rows.length > 0) groups.push({ ...group, rows });
		}
		if (mode === "commands") {
			const matched = gotoProjectRows(deps).filter((row) => rowMatches(row, typed));
			if (matched.length > 0) groups.push({ id: "projects", heading: "Projects", rows: matched });
		}
	}

	// The footer hint names a key that exists: the key of the ticket in
	// context, then the route's project, then the first project.
	const hintKey =
		identifier?.split("-")[0] ?? deps.routeProject ?? [...projects].sort((a, b) => a.position - b.position)[0]!.key;

	const named = groups
		.filter((group) => group.id !== "results")
		.flatMap((group) => group.rows)
		.find((row) => rowMatches(row, typed));
	// What Enter runs: the ticket an ID names, then a matching command, then
	// the first ticket result. An arrow key selects another row.
	const best =
		submenu !== null
			? undefined
			: typed === ""
				? groups[0]?.rows[0]?.value
				: (results.jump ?? named?.value ?? results.tickets[0]?.identifier);
	const nothing =
		typed !== "" && submenu === null && results.state === "success" && results.jump === null && groups.length === 0;

	useEffect(() => {
		if (best !== undefined) setValue(best);
	}, [best]);

	const activeValue = submenu === null ? best : value;
	useEffect(() => {
		const field = fieldRef.current;
		if (field === null || activeValue === undefined || activeValue === "") return;
		const listId = field.getAttribute("aria-controls");
		const list = listId === null ? null : document.getElementById(listId);
		if (list === null) return;
		const syncActiveOption = () => {
			const selected = list.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
			if (selected === null) field.removeAttribute("aria-activedescendant");
			else if (field.getAttribute("aria-activedescendant") !== selected.id) {
				field.setAttribute("aria-activedescendant", selected.id);
			}
		};
		syncActiveOption();
		const observer = new MutationObserver(syncActiveOption);
		observer.observe(list, {
			subtree: true,
			attributes: true,
			attributeFilter: ["aria-selected"],
		});
		observer.observe(field, {
			attributes: true,
			attributeFilter: ["aria-activedescendant"],
		});
		return () => observer.disconnect();
	}, [activeValue]);

	const leaveSubmenu = () => {
		setQuery("");
		setValue("");
		onSubmenu(null);
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Backspace" && submenu !== null && query === "") {
			event.preventDefault();
			leaveSubmenu();
			return;
		}
		if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
		event.preventDefault();
		action.navigate(typed === "" ? "/search" : `/search?q=${encodeURIComponent(typed)}`);
		commandActions.close();
	};

	return (
		<Command.Root
			label={fieldLabel}
			value={value}
			onValueChange={setValue}
			shouldFilter={submenu !== null}
			className="min-h-0 flex-1 max-md:[&_[cmdk-item]]:h-11"
		>
			<Command.Field
				label={fieldLabel}
				placeholder={fieldLabel}
				context={identifier ?? undefined}
				inputRef={fieldRef}
				leading={
					submenu === null ? undefined : (
						<Tooltip content="Back to commands" side="bottom">
							<IconButton label="Back to commands" icon={<ArrowLeft />} size="xs" onClick={leaveSubmenu} />
						</Tooltip>
					)
				}
				value={query}
				onValueChange={setQuery}
				onKeyDown={onKeyDown}
				autoFocus
			/>
			<p role="status" aria-live="polite" className="sr-only">
				{nothing ? "No results" : ""}
			</p>
			{submenu === null && results.state === "loading" && (
				<div
					aria-live="polite"
					aria-busy="true"
					className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-sm text-fg-muted"
				>
					<Spinner />
					Searching tickets
				</div>
			)}
			{submenu === null && results.state === "error" && (
				<FailureState
					variant="inline"
					title="Ticket search did not load"
					className="shrink-0 border-b border-border px-3 py-2"
					action={
						<Button size="sm" onClick={results.retry}>
							Retry
						</Button>
					}
				/>
			)}
			{submenu !== null && <SubmenuGroup submenu={submenu} deps={deps} onDefaultValue={setValue} />}
			{submenu === null && (
				<Command.List className="min-h-0 flex-1 max-h-none">
					{results.jump !== null && drawRows([jumpRow(results.jump, deps)])}
					{groups.map((group) => (
						<Command.Group key={group.id} heading={group.heading}>
							{drawRows(group.rows)}
						</Command.Group>
					))}
					{nothing && <Command.Empty>No results</Command.Empty>}
				</Command.List>
			)}
			<Command.Footer>
				{submenu === null ? (
					<>
						<span className="flex items-center gap-1.5 max-sm:hidden">
							<Kbd className={footerKeyClass}>↑↓</Kbd> move
						</span>
						<span className="flex items-center gap-1.5 max-sm:hidden">
							<Kbd className={footerKeyClass}>↵</Kbd> run
						</span>
						<span className="flex items-center gap-1.5 text-fg-muted">
							{formatShortcut("mod+enter", currentPlatform()).map((cap) => (
								<Kbd key={cap} className={footerKeyClass}>
									{cap}
								</Kbd>
							))}
							open full search
						</span>
						<span className="ml-auto max-md:hidden" title={`Type an ID such as ${hintKey}-12 to open the ticket`}>
							Type an ID such as <CodeText>{hintKey}-12</CodeText> to open the ticket
						</span>
					</>
				) : (
					<span className="flex min-w-0 items-center gap-1.5 text-fg-muted">
						<Kbd className={footerKeyClass}>backspace</Kbd> back
					</span>
				)}
			</Command.Footer>
		</Command.Root>
	);
}
