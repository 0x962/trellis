import { FlashList } from "@shopify/flash-list";
import type { ProjectSummary } from "@trellis/api";
import { ProjectRow } from "./components/ProjectRow";

// Two projects draw in position order. Two positions that are equal draw in
// id order, so one list always gives one order.
const inOrder = (a: ProjectSummary, b: ProjectSummary) => a.position - b.position || (a.id < b.id ? -1 : 1);

export type ProjectTreeProps = {
	projects: readonly ProjectSummary[];
	// Takes the key of the pressed row, such as CDE.
	onSelect: (key: string) => void;
};

// The projects as one list of fixed-height rows.
export function ProjectTree({ projects, onSelect }: ProjectTreeProps) {
	return (
		<FlashList
			testID="project-tree"
			data={[...projects].sort(inOrder)}
			keyExtractor={(project) => project.key}
			renderItem={({ item }) => <ProjectRow project={item} onPress={onSelect} />}
		/>
	);
}
