import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, Skeleton } from "@trellis/ui";
import { ReactFlowProvider } from "@xyflow/react";
import { Workflow } from "lucide-react";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { FlowWorkspace } from "./components/FlowWorkspace";

// Loads a flow by its slug and opens it on the canvas. `generation` rises on
// a reload, which mounts a fresh workspace from the refetched flow.
export function FlowEditor({ slug }: { slug: string }) {
	const { orpc } = useApp();
	const doc = useQuery(orpc.flows.get.queryOptions({ input: { flow: slug }, retry: false }));
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {}, retry: false }));
	const [generation, setGeneration] = useState(0);

	if (doc.isError) {
		const missing = doc.error instanceof ORPCError && doc.error.code === "NOT_FOUND";
		return (
			<EmptyState
				variant="page"
				icon={<Workflow />}
				title={missing ? "No flow with this name" : "Could not load the flow"}
				description={missing ? `No flow has the slug “${slug}”.` : doc.error.message}
			/>
		);
	}
	if (doc.isPending || personas.isPending)
		return (
			<div role="status" aria-label="Load the flow" className="flex min-h-0 flex-1 flex-col gap-3 p-6">
				<span className="sr-only">Load the flow</span>
				<Skeleton className="h-11 w-full" />
				<Skeleton className="min-h-0 w-full flex-1" />
			</div>
		);
	return (
		<ReactFlowProvider>
			<FlowWorkspace
				key={`${doc.data.flow.id}.${generation}`}
				doc={doc.data}
				personas={personas.data ?? []}
				onReload={() => void doc.refetch().then(() => setGeneration((value) => value + 1))}
			/>
		</ReactFlowProvider>
	);
}
