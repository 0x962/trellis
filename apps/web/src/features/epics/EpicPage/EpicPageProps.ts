import type { Project } from "@trellis/api";
import type { View } from "../../filters/grammar";

export type EpicPageProps = {
	project: Project;
	slug: string;
	search: Partial<View>;
	onSearchChange: (next: Partial<View>) => void;
};
