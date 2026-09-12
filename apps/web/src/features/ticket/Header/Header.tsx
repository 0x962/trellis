import { ArrowLeft, ArrowsOut, Copy, GitBranch, List, X } from "@phosphor-icons/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { IconButton, Skeleton, TicketId, Tooltip, useHotkey, useMediaQuery } from "@trellis/ui";
import { copyText } from "../../../lib/clipboard";
import { lastListHref } from "../../../lib/lastList";
import { uiActions } from "../../../stores/uiStore";
import { Breadcrumb } from "../../shell/Breadcrumb";
import { useParentSummary } from "../hooks/useParentSummary";
import { branchName, titleSlug } from "../PropertiesRail/utils/branchName";
import { usePeek } from "../TicketPeek/hooks/usePeek";
import { BriefCopy } from "./components/BriefCopy";
import { MoreMenu, ticketLink } from "./components/MoreMenu";
import { ParentChip } from "./components/ParentChip";

export type HeaderProps =
	| {
			ticket: Ticket;
			identifier?: never;
			// The page carries Back to list; the peek carries Expand and Close.
			surface: "page" | "peek";
	  }
	| {
			ticket: undefined;
			identifier: string;
			surface: "peek";
	  };

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");

// A copy chord in a text field or over a selection is the browser's own
// copy. Everywhere else on the surface it copies the ticket's value.
const claims = (event: KeyboardEvent) => {
	if (editable(event.target) || (window.getSelection()?.toString() ?? "") !== "") return false;
	event.preventDefault();
	return true;
};

// The sticky bar shows the ticket ID in a peek and the project path on a page.
// It also shows the parent and the ticket actions.
// The copy chords Cmd+C, Cmd+Shift+C, and Cmd+. work on the full ticket surface.
export function Header(props: HeaderProps) {
	const ticket = props.ticket;
	const surface = props.surface;
	const navigate = useNavigate();
	const router = useRouter();
	const peek = usePeek();
	const parentSummary = useParentSummary(ticket?.parent?.identifier ?? null);
	const identifier = ticket === undefined ? props.identifier : ticket.identifier;
	const branch = ticket === undefined ? "" : branchName(ticket.identifier, titleSlug(ticket.title));
	// Below 768 px the page header keeps Back, the ID, and the more menu.
	const phone = useMediaQuery("(max-width: 767px)") && surface === "page";

	useHotkey("mod+c", (event) => {
		if (ticket === undefined) return;
		if (claims(event)) void copyText(ticket.identifier, `Copied ${ticket.identifier}`);
	});
	useHotkey("mod+shift+c", (event) => {
		if (ticket === undefined) return;
		if (claims(event)) void copyText(branch, "Copied the branch name");
	});
	useHotkey("mod+.", (event) => {
		if (ticket === undefined) return;
		if (claims(event)) void copyText(ticketLink(ticket.identifier), "Copied the link");
	});

	const expand = () => void navigate({ to: "/t/$identifier", params: { identifier } });
	const back = lastListHref();
	if (ticket !== undefined && surface === "page" && ticket.parent !== null && parentSummary === undefined) {
		return <div className="h-13 shrink-0 border-border border-b" />;
	}

	return (
		<section
			aria-label="Ticket header"
			className="sticky top-0 z-10 flex h-13 shrink-0 items-center gap-2 border-b border-border bg-surface px-4"
		>
			{/* The ticket page has no Topbar, so under 768 px its header carries
			the menu button that opens the sidebar sheet. */}
			{surface === "page" && (
				<IconButton
					label="Open the sidebar"
					icon={<List />}
					className="-ml-2 md:hidden"
					onClick={() => uiActions.setMobileSidebarOpen(true)}
				/>
			)}
			{ticket !== undefined && surface === "page" && (
				<a
					href={back}
					aria-label="Back to list"
					onClick={(event) => {
						event.preventDefault();
						void router.navigate({ href: back });
					}}
					className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11 md:-ml-2"
				>
					<ArrowLeft className="size-3.5" aria-hidden="true" />
				</a>
			)}
			<div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
				{ticket === undefined ? (
					<Skeleton width="w-16" height="h-3" />
				) : phone || surface === "peek" ? (
					<TicketId id={ticket.identifier} />
				) : (
					<Breadcrumb path={ticket.project.path} />
				)}
				{ticket !== undefined && !phone && ticket.parent !== null && (
					<>
						<span aria-hidden="true" className="text-fg-faint">
							·
						</span>
						<ParentChip ancestors={ticket.ancestors} title={parentSummary?.title ?? ""} />
					</>
				)}
			</div>
			<div className="ml-auto flex shrink-0 items-center gap-1">
				{ticket !== undefined && (
					<>
						{surface === "page" && <BriefCopy ticket={ticket} />}
						{!phone && (
							<>
								<Tooltip content="Copy ID ⌘C">
									<IconButton
										label="Copy ID"
										size="sm"
										icon={<Copy />}
										onClick={() => void copyText(ticket.identifier, `Copied ${ticket.identifier}`)}
									/>
								</Tooltip>
								<Tooltip content="Copy branch name ⌘⇧C">
									<IconButton
										label="Copy branch name"
										size="sm"
										icon={<GitBranch />}
										onClick={() => void copyText(branch, "Copied the branch name")}
									/>
								</Tooltip>
							</>
						)}
						<MoreMenu ticket={ticket} />
					</>
				)}
				{surface === "peek" && (
					<>
						<span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
						<Tooltip content="Expand to the full page">
							<IconButton label="Expand to the full page" size="sm" icon={<ArrowsOut />} onClick={expand} />
						</Tooltip>
						<Tooltip content="Close Esc">
							<IconButton label="Close" size="sm" icon={<X />} onClick={peek.close} />
						</Tooltip>
					</>
				)}
			</div>
		</section>
	);
}
