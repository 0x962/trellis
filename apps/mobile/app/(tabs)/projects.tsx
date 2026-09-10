import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { EmptyState } from "../../src/components/EmptyState";
import { ProjectTree } from "../../src/features/projects/ProjectTree";
import { getQueries } from "../../src/lib/orpc";

export default function ProjectsScreen() {
	const projects = useQuery(getQueries().projects.list.queryOptions({ input: {} }));
	if (projects.isPending) return null;
	if (projects.isError) return <EmptyState title="Can't load projects" hint="Check the server and try again." />;

	const visible = projects.data.filter((project) => project.archivedAt === null);
	if (visible.length === 0) {
		return <EmptyState title="No projects yet" hint="Projects appear here once the server has one." />;
	}

	return <ProjectTree projects={visible} onSelect={(path) => router.push(`/project/${path}`)} />;
}
