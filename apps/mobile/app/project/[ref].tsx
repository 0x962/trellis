import { useLocalSearchParams } from "expo-router";
import { ProjectTicketList } from "../../src/features/projects/ProjectTicketList";

// One project's ticket list. The header carries the project name.
export default function ProjectScreen() {
	const { ref } = useLocalSearchParams<{ ref: string }>();
	return <ProjectTicketList project={ref} />;
}
