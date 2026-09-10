import { FolderOpen } from "lucide-react";
import { projectSlashPath } from "../../../../../lib/projectPath";

export type ScopeChipProps = {
	// The API ref of the project route.
	path: string;
	scope: "subprojects" | "self";
	onToggle: () => void;
};

// The implicit chip at the head of a project's filter bar: which projects
// the list covers. A click flips between the subtree and this project only.
export function ScopeChip({ path, scope, onToggle }: ScopeChipProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={scope === "self"}
			className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface pr-1.5 pl-1 text-xs whitespace-nowrap text-fg-muted transition-colors duration-hover hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
		>
			<span aria-hidden="true" className="inline-flex size-3 shrink-0 *:size-full">
				<FolderOpen />
			</span>
			in {projectSlashPath(path)}
			{scope === "self" ? " only" : " + sub-projects"}
		</button>
	);
}
