import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ProjectSessionsPage } from "../features/sessions/ProjectSessionsPage";
import { useApp } from "../lib/appContext";

export const Route = createFileRoute("/sessions/project/$project")({
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(context.orpc.projects.get.queryOptions({ input: { project: params.project } })),
	component: ProjectSessionsRoute,
});

function ProjectSessionsRoute() {
	const { orpc } = useApp();
	const { project: ref } = Route.useParams();
	const project = useSuspenseQuery(orpc.projects.get.queryOptions({ input: { project: ref } })).data;
	return <ProjectSessionsPage key={project.id} project={project} />;
}
