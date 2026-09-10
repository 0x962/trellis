import { FlashList } from "@shopify/flash-list";
import type { ProjectSummary } from "@trellis/api";
import { ProjectRow } from "./components/ProjectRow";
import { flattenProjects } from "./flattenProjects";

export type ProjectTreeProps = {
	projects: readonly ProjectSummary[];
	// Takes the canonical project path of the pressed row, such as CDE.web.
	onSelect: (path: string) => void;
};

// The project tree as one indented list of fixed-height rows.
export function ProjectTree({ projects, onSelect }: ProjectTreeProps) {
	return (
		<FlashList
			testID="project-tree"
			data={flattenProjects(projects)}
			keyExtractor={(project) => project.path}
			renderItem={({ item }) => <ProjectRow project={item} onPress={onSelect} />}
		/>
	);
}
