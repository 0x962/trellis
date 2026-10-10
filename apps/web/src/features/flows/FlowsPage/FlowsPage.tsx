import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { flowProjectLabel } from "@trellis/api";
import { Badge, Button, EmptyState, EntityCard, FailureState, IconButton, Skeleton, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { usePageCreate } from "../../../lib/usePageCreate";
import { PageTitle } from "../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../shell/Topbar";
import { NewFlowDialog } from "./components/NewFlowDialog";

export function FlowsPage() {
	const { orpc } = useApp();
	const navigate = useNavigate();
	const flows = useQuery(orpc.flows.list.queryOptions({ input: {}, retry: false }));
	const [creating, setCreating] = useState(false);
	const createFlow = () => setCreating(true);
	usePageCreate(createFlow);
	const open = (slug: string) => void navigate({ to: "/ai/flows/$slug", params: { slug } });

	return (
		<>
			<Topbar
				actions={
					<Tooltip content="New flow">
						<TopbarActionButton label="New flow" icon={<Plus />} onClick={createFlow} />
					</Tooltip>
				}
			>
				<PageTitle title="Flows" />
			</Topbar>
			{flows.data?.length === 0 ? (
				<EmptyState
					variant="page"
					className="page-card"
					title="No flows yet"
					description="Create a flow to define a repeatable process."
					action={
						<Button size="md" onClick={createFlow}>
							New flow
						</Button>
					}
				/>
			) : (
				<div className="page-card flex-1 overflow-y-auto px-8 py-6 max-md:px-4">
					<div className="flex max-w-7xl flex-col gap-6">
						<p className="text-sm text-fg-muted">
							Draw how agents work together: the steps, their order, and their limits.
						</p>
						{flows.isPending ? (
							<div role="status" aria-label="Load flows" className="flex flex-col gap-3">
								<span className="sr-only">Load flows</span>
								<Skeleton className="h-24 w-full" />
								<Skeleton className="h-24 w-full" />
							</div>
						) : flows.isError ? (
							<FailureState
								title="Could not load flows"
								detail={flows.error.message}
								action={
									<Tooltip content="Retry">
										<IconButton
											label="Retry"
											icon={<ArrowClockwise />}
											disabled={flows.isFetching}
											onClick={() => void flows.refetch()}
										/>
									</Tooltip>
								}
							/>
						) : (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
								{flows.data.map((flow) => (
									<EntityCard
										key={flow.id}
										title={flow.name}
										description={flow.description === "" ? "No description." : flow.description}
										badges={<Badge tone="neutral">{flowProjectLabel(flow)}</Badge>}
										link={<Link to="/ai/flows/$slug" params={{ slug: flow.slug }} />}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			)}
			{creating && <NewFlowDialog onClose={() => setCreating(false)} onCreated={(flow) => open(flow.slug)} />}
		</>
	);
}
