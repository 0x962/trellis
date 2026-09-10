import { useQuery } from "@tanstack/react-query";
import { Tabs, useLocalSearchParams } from "expo-router";
import { ProjectTicketList } from "../../src/features/projects/ProjectTicketList";
import { getQueries } from "../../src/lib/orpc";

// One project's ticket list. The header carries the project name, and it
// stays empty until the server answers.
export default function ProjectScreen() {
	const { ref } = useLocalSearchParams<{ ref: string }>();
	const project = useQuery(getQueries().projects.get.queryOptions({ input: { project: ref } }));
	return (
		<>
			<Tabs.Screen options={{ title: project.data?.name ?? "" }} />
			<ProjectTicketList project={ref} />
		</>
	);
}
