import { Plus } from "@phosphor-icons/react";
import { useRouterState } from "@tanstack/react-router";
import { Tooltip } from "@trellis/ui";
import { projectRefOfPathname } from "../../../lib/projectUrl";
import { usePageCreate } from "../../../lib/usePageCreate";
import { routeDefaults } from "../../command/utils/routeDefaults";
import { composerActions } from "../../composer";
import { TopbarActionButton } from "../Topbar";

// The create control of a list page: a round button with a plus, the shape
// every create control takes. The New ticket dialog opens in the project of
// the page. A filter or a grouping of the page never seeds the status, so
// the ticket starts in the project's default status.
export function NewTicketButton({ disabled = false }: { disabled?: boolean }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const project = projectRefOfPathname(pathname);
	const search = useRouterState({ select: (state) => state.location.search as Record<string, unknown> });
	usePageCreate(() => composerActions.open(routeDefaults(pathname, search)), !disabled);
	return (
		<Tooltip content="New ticket">
			<TopbarActionButton
				label="New ticket"
				icon={<Plus />}
				disabled={disabled}
				onClick={() => composerActions.open(project === null ? {} : { project })}
			/>
		</Tooltip>
	);
}
