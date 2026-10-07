import { Copy, GitBranch } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Ticket } from "@trellis/api";
import { isTextEntry, Tooltip, useHotkey, useMediaQuery } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { copyText } from "../../../lib/clipboard";
import { PageTitle } from "../../shell/PageTitle";
import { ProjectBreadcrumb } from "../../shell/ProjectBreadcrumb";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { branchName, titleSlug } from "../PropertiesRail/utils/branchName";
import { BriefCopy } from "./components/BriefCopy";
import { MoreMenu, ticketLink } from "./components/MoreMenu";

export type HeaderProps = {
	ticket: Ticket;
	// An archived project permits copies and navigation but refuses ticket writes.
	readOnly: boolean;
};

// A copy chord in a text field or over a selection copies the selected text.
const claims = (event: KeyboardEvent) => {
	if (isTextEntry(event.target) || (window.getSelection()?.toString() ?? "") !== "") return false;
	event.preventDefault();
	return true;
};

export function Header({ ticket, readOnly }: HeaderProps) {
	const { orpc } = useApp();
	const project = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project: ticket.project.key } })).data;
	const phone = useMediaQuery("(max-width: 767px)");
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

	return (
		<Topbar
			actions={
				<>
					<BriefCopy ticket={ticket} />

					{!phone && (
						<>
							<Tooltip content="Copy ID ⌘C">
								<TopbarActionButton
									label="Copy ID"
									icon={<Copy />}
									onClick={() => void copyText(ticket.identifier, `Copied ${ticket.identifier}`)}
								/>
							</Tooltip>
							<Tooltip content="Copy branch name ⌘⇧C">
								<TopbarActionButton
									label="Copy branch name"
									icon={<GitBranch />}
									onClick={() => void copyText(branch, "Copied the branch name")}
								/>
							</Tooltip>
						</>
					)}
					<MoreMenu ticket={ticket} readOnly={readOnly} />
				</>
			}
		>
			<PageTitle parent={<ProjectBreadcrumb project={project} />} title={ticket.identifier} />
		</Topbar>
	);
}
