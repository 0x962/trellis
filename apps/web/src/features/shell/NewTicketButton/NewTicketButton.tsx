import { Plus } from "@phosphor-icons/react";
import { useRouterState } from "@tanstack/react-router";
import { Tooltip } from "@trellis/ui";
import { projectRefOfPathname } from "../../../lib/projectPath";
import { composerActions } from "../../composer";
import { TopbarActionButton } from "../Topbar";

// The create control of a list page: a round button with a plus, the shape
// every create control takes. The New ticket dialog opens in the project of
// the page. A filter or a grouping of the page never seeds the status, so
// the ticket starts in the project's default status.
export function NewTicketButton() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const project = projectRefOfPathname(pathname);
	return (
		<Tooltip content="New ticket">
			<TopbarActionButton
				label="New ticket"
				icon={<Plus />}
				onClick={() => composerActions.open(project === null ? {} : { project })}
			/>
		</Tooltip>
	);
}
