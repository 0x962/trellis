import { createFileRoute } from "@tanstack/react-router";
import { FlowEditor } from "../features/flows/FlowEditor";

export const Route = createFileRoute("/ai/flows_/$slug")({ component: FlowEditorPage });

function FlowEditorPage() {
	const { slug } = Route.useParams();
	return <FlowEditor slug={slug} />;
}
