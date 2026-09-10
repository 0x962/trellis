import type { ProjectSummary } from "@trellis/api";

export type ProjectTreeProps = {
	projects: readonly ProjectSummary[];
	// Takes the canonical project path of the pressed row, such as CDE.web.
	onSelect: (path: string) => void;
};

// The project tree as one indented list of fixed-height rows.
export function ProjectTree(_props: ProjectTreeProps) {
	return null;
}
