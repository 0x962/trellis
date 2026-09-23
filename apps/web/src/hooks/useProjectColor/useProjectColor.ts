import { useQuery } from "@tanstack/react-query";
import type { ProjectColor } from "@trellis/ui";
import { useApp } from "../../lib/appContext";
import { colorOfProjectKey } from "../../lib/projectChipColor";

// The color of the project a row names. The query gives back that one color,
// so a row redraws only when the color of its project changes.
export const useProjectColor = (key: string): ProjectColor | null => {
	const { orpc } = useApp();
	return (
		useQuery({
			...orpc.projects.list.queryOptions({ input: {} }),
			select: (projects) => colorOfProjectKey(projects, key),
		}).data ?? null
	);
};
