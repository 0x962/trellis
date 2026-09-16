import { useNavigate } from "@tanstack/react-router";
import { EmptyState } from "@trellis/ui";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar } from "../../shell/Topbar";
import { TicketTable } from "../../table/TicketTable";

export function NeedsYou() {
	const navigate = useNavigate();

	return (
		<>
			<Topbar>
				<PageTitle title="Needs you" />
			</Topbar>
			<div data-testid="needs-you-body" className="page-card flex min-h-0 flex-1 flex-col overflow-hidden">
				<TicketTable
					routeKey="/needs-you"
					search={{ category: ["review"], reviewer: "human", group: "none" }}
					onOpenPage={(identifier) => void navigate({ to: "/t/$identifier", params: { identifier } })}
					emptyState={
						<EmptyState
							title="Nothing needs review"
							description="Tickets in human review appear here."
							variant="page"
						/>
					}
				/>
			</div>
		</>
	);
}
