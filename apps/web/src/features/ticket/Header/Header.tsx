import { ArrowLeft, Copy, GitBranch } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { IconButton, Tooltip, useHotkey, useMediaQuery } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { copyText } from "../../../lib/clipboard";
import { lastListHref } from "../../../lib/lastList";
import { projectSlashPath } from "../../../lib/projectPath";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { branchName, titleSlug } from "../PropertiesRail/utils/branchName";
import { BriefCopy } from "./components/BriefCopy";
import { MoreMenu, ticketLink } from "./components/MoreMenu";

export type HeaderProps = { ticket: Ticket };

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA");

// A copy chord in a text field or over a selection copies the selected text.
const claims = (event: KeyboardEvent) => {
	if (editable(event.target) || (window.getSelection()?.toString() ?? "") !== "") return false;
	event.preventDefault();
	return true;
};

export function Header({ ticket }: HeaderProps) {
	const router = useRouter();
	const { orpc } = useApp();
	const project = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project: ticket.project.path } })).data;
	const phone = useMediaQuery("(max-width: 767px)");
	const branch = branchName(ticket.identifier, titleSlug(ticket.title));
	const back = lastListHref();

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
			bordered={false}
			actions={
				<>
					<BriefCopy ticket={ticket} />
					<Tooltip content="Back to list">
						<IconButton
							label="Back to list"
							role="link"
							icon={<ArrowLeft />}
							variant="default"
							render={<a href={back} />}
							nativeButton={false}
							onClick={(event) => {
								event.preventDefault();
								void router.navigate({ href: back });
							}}
						/>
					</Tooltip>
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
				</>
			}
		>
			<PageTitle
				parent={
					<Link
						className="block max-w-48 truncate max-sm:max-w-20"
						to="/p/$"
						params={{ _splat: projectSlashPath(ticket.project.path) }}
						search={{}}
					>
						{project.name}
					</Link>
				}
				title={ticket.identifier}
			/>
		</Topbar>
	);
}
