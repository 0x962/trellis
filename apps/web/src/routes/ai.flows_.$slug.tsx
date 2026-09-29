import { createFileRoute } from "@tanstack/react-router";
import { FlowEditorRoute } from "../features/flows/LangflowEditor/components/FlowEditorRoute";

export const Route = createFileRoute("/ai/flows_/$slug")({ component: FlowEditorPage });

function FlowEditorPage() {
	const { slug } = Route.useParams();
	return <FlowEditorRoute slug={slug} />;
}
