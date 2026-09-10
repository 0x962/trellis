import { cx } from "@trellis/ui";
import { FolderOpen } from "lucide-react";
import { projectSlashPath } from "../../../../../lib/projectPath";

export type ScopeChipProps = {
	// The API ref of the project route.
	path: string;
	scope: "subprojects" | "self";
	onToggle: () => void;
};

// The implicit chip at the head of a project's filter bar: which projects
// the list covers. The toggle flips between the subtree and this project only.
export function ScopeChip({ path, scope, onToggle }: ScopeChipProps) {
	const subprojects = scope === "subprojects";
	return (
		<span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border border-border bg-surface pr-1 pl-1 text-xs whitespace-nowrap text-fg-muted">
			<span aria-hidden="true" className="inline-flex size-3 shrink-0 *:size-full">
				<FolderOpen />
			</span>
			<button
				type="button"
				aria-pressed={subprojects}
				aria-label={subprojects ? "Exclude sub-projects" : "Include sub-projects"}
				onClick={onToggle}
				className={cx(
					"rounded-sm px-0.5 transition-colors duration-hover hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1",
					subprojects ? "text-fg-faint" : "font-medium text-fg",
				)}
			>
				{`in ${projectSlashPath(path)} ${subprojects ? "+ sub-projects" : "only"}`}
			</button>
		</span>
	);
}
