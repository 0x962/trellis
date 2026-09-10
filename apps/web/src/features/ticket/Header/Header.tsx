import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { IconButton, Skeleton, TicketId, Tooltip, useHotkey, useMediaQuery } from "@trellis/ui";
import { ArrowLeft, Copy, Maximize2, Menu, X } from "lucide-react";
import { copyText } from "../../../lib/clipboard";
import { lastListHref } from "../../../lib/lastList";
import { uiActions } from "../../../stores/uiStore";
import { BriefCopy } from "../../agent/BriefCopy";
import { StartWithAgent } from "../../agent/StartWithAgent";
import { Breadcrumb } from "../../shell/Breadcrumb";
import { useParentSummary } from "../hooks/useParentSummary";
import { branchName, titleSlug } from "../PropertiesRail/utils/branchName";
import { usePeek } from "../TicketPeek/hooks/usePeek";
import { MoreMenu, ticketLink } from "./components/MoreMenu";
import { ParentChip } from "./components/ParentChip";
import { ReviewActions } from "./components/ReviewActions";

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

// The sticky bar at the top of a ticket: the project path, the parent,
// then the actions. The copy chords Cmd+C, Cmd+Shift+C, and Cmd+. work
// anywhere on the surface.
export function Header(props: HeaderProps) {
	const ticket = props.ticket;
	const surface = props.surface;
	const navigate = useNavigate();
	const router = useRouter();
	const peek = usePeek();
	const parentSummary = useParentSummary(ticket?.parent?.identifier ?? null);
	const identifier = ticket === undefined ? props.identifier : ticket.identifier;
	const branch = ticket === undefined ? "" : branchName(ticket.identifier, titleSlug(ticket.title));
	// Below 768 px the page header keeps Back, the ID, and the more menu. TicketView
	// draws the review actions and Start with agent under the properties grid.
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
		return <div className="h-11 shrink-0 border-border border-b" />;
	}

	return (
		<section
			aria-label="Ticket header"
			className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-surface px-4"
		>
			{/* The ticket page has no Topbar, so under 768 px its header carries
			the menu button that opens the sidebar sheet. */}
			{surface === "page" && (
				<IconButton
					label="Open the sidebar"
					icon={<Menu />}
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
					className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:-ml-2"
				>
					<ArrowLeft className="size-3.5" aria-hidden="true" />
				</a>
			)}
			{ticket === undefined ? (
				<Skeleton width="w-16" height="h-3" />
			) : phone ? (
				<TicketId id={ticket.identifier} />
			) : (
				<Breadcrumb path={ticket.project.path} />
			)}
			{ticket !== undefined && !phone && ticket.parent !== null && (
				<>
					<span aria-hidden="true" className="text-fg-faint">
						·
					</span>
					<ParentChip parent={ticket.parent} title={parentSummary?.title ?? ""} />
				</>
			)}
			<div className="ml-auto flex shrink-0 items-center gap-2">
				{ticket !== undefined && (
					<>
						{!phone && <ReviewActions ticket={ticket} />}
						{!phone && <StartWithAgent ticket={ticket} />}
						<BriefCopy ticket={ticket} />
						{!phone && (
							<Tooltip content="Copy ID ⌘C">
								<IconButton
									label="Copy ID"
									size="md"
									icon={<Copy />}
									onClick={() => void copyText(ticket.identifier, `Copied ${ticket.identifier}`)}
								/>
							</Tooltip>
						)}
						<MoreMenu ticket={ticket} />
					</>
				)}
				{surface === "peek" && (
					<>
						<span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
						<Tooltip content="Expand to the full page">
							<IconButton label="Expand to the full page" size="md" icon={<Maximize2 />} onClick={expand} />
						</Tooltip>
						<Tooltip content="Close Esc">
							<IconButton label="Close" size="md" icon={<X />} onClick={peek.close} />
						</Tooltip>
					</>
				)}
			</div>
		</section>
	);
}
