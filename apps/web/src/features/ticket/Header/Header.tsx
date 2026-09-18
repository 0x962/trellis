import { ArrowLeft, Copy, GitBranch } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { IconButton, isTextEntry, Tooltip, useHotkey, useMediaQuery } from "@trellis/ui";
import { useBackNavigation } from "../../../hooks/useBackNavigation";
import { useApp } from "../../../lib/appContext";
import { copyText } from "../../../lib/clipboard";
import { usePageSheet } from "../../shell/PageSheet";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar } from "../../shell/Topbar";
import { branchName, titleSlug } from "../PropertiesRail/utils/branchName";
import { BriefCopy } from "./components/BriefCopy";
import { MoreMenu, ticketLink } from "./components/MoreMenu";

export type HeaderProps = {
	ticket: Ticket;
	// True for a ticket under an archived project. The server refuses every
	// write to it, so the header disables its actions.
	readOnly: boolean;
};

// A copy chord in a text field or over a selection copies the selected text.
const claims = (event: KeyboardEvent) => {
	if (isTextEntry(event.target) || (window.getSelection()?.toString() ?? "") !== "") return false;
	event.preventDefault();
	return true;
};

export function Header({ ticket, readOnly }: HeaderProps) {
	const { back } = useBackNavigation();
	const { orpc } = useApp();
	const project = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project: ticket.project.path } })).data;
	const phone = useMediaQuery("(max-width: 767px)");
	const inSheet = usePageSheet() !== null;
	const branch = branchName(ticket.identifier, titleSlug(ticket.title));

	useHotkey("mod+c", (event) => {
		if (claims(event)) void copyText(ticket.identifier, `Copied ${ticket.identifier}`);
	});
	useHotkey("mod+shift+c", (event) => {
		if (claims(event)) void copyText(branch, "Copied the branch name");
	});
	useHotkey("mod+.", (event) => {
		if (claims(event)) void copyText(ticketLink(ticket.identifier), "Copied the link");
	});

	// In a `PageSheet`, `Topbar` renders the actions into the header of the
	// sheet. That header is outside the disabled fieldset that `TicketView`
	// draws around a read-only ticket, so the actions carry their own.
	return (
		<Topbar
			actions={
				<>
					{!inSheet && (
						<Tooltip content="Back (Esc)">
							<IconButton label="Back" icon={<ArrowLeft />} variant="default" onClick={back} />
						</Tooltip>
					)}
					<fieldset disabled={readOnly} className="contents">
						<BriefCopy ticket={ticket} />

						{!phone && (
							<>
								<Tooltip content="Copy ID ⌘C">
									<IconButton
										label="Copy ID"
										variant="default"
										icon={<Copy />}
										onClick={() => void copyText(ticket.identifier, `Copied ${ticket.identifier}`)}
									/>
								</Tooltip>
								<Tooltip content="Copy branch name ⌘⇧C">
									<IconButton
										label="Copy branch name"
										variant="default"
										icon={<GitBranch />}
										onClick={() => void copyText(branch, "Copied the branch name")}
									/>
								</Tooltip>
							</>
						)}
						<MoreMenu ticket={ticket} />
					</fieldset>
				</>
			}
		>
			<PageTitle parent={<ProjectBreadcrumb project={project} />} title={ticket.identifier} />
		</Topbar>
	);
}
