import { useQuery } from "@tanstack/react-query";
import { FailureState } from "@trellis/ui";
import { actorHeader, useActor } from "../../../../../lib/actor";
import { useApp } from "../../../../../lib/appContext";
import { useLiveStatus } from "../../../../../lib/liveStatus";
import { FlowEditor } from "../../../FlowEditor";
import { EditorMount } from "./components/EditorMount";

export function FlowEditorRoute({ slug }: { slug: string }) {
	const { orpc } = useApp();
	const document = useQuery(orpc.flowDocumentsV1.get.queryOptions({ input: { flow: slug }, retry: false }));
	if (document.isError)
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="The flow could not open"
				detail={document.error.message}
			/>
		);
	if (document.isPending)
		return (
			<p role="status" className="page-card p-6 text-sm text-fg-muted">
				Load the flow.
			</p>
		);
	if (document.data.engine === "legacy") return <FlowEditor slug={slug} />;
	return <LangflowRoute key={document.data.flow.id} flow={document.data.flow.id} />;
}

function LangflowRoute({ flow }: { flow: string }) {
	const { client, orpc, queryClient, live } = useApp();
	const actor = useActor();
	const status = useLiveStatus(live);
	const options = orpc.flowDocumentsV1.editorHost.queryOptions({ input: {}, refetchOnMount: "always" });
	const host = useQuery(options);
	if (host.isError)
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="The editor host is unavailable"
				detail={host.error.message}
			/>
		);
	if (host.isPending)
		return (
			<p role="status" className="page-card p-6 text-sm text-fg-muted">
				Read the editor host.
			</p>
		);
	if (host.data.host === null || actor === null)
		return (
			<FailureState
				variant="page"
				className="page-card"
				title="The editor is unavailable"
				description="Configure the editor host and human name before you open this flow."
			/>
		);
	return (
		<EditorMount
			client={client}
			flow={flow}
			connected={status === "live"}
			currentIdentity={() => ({
				host: live.status.get() === "live" ? (queryClient.getQueryData(options.queryKey)?.host ?? null) : null,
				actor: actorHeader(),
			})}
		/>
	);
}
