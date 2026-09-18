import type { Project } from "@trellis/api";
import { Button } from "@trellis/ui";
import { useProjectActions } from "../hooks/useProjectActions";

export type ArchivedBannerProps = {
	project: Project;
};

// The bar over every page of an archived project. The server refuses every
// write to it, so the page disables its controls and this bar says why.
export function ArchivedBanner({ project }: ArchivedBannerProps) {
	const { setArchived } = useProjectActions();
	return (
		<div className="flex min-h-9 shrink-0 flex-wrap items-center justify-center gap-3 bg-warning-soft px-5 py-1 text-sm font-medium text-warning">
			<span>This project is archived. It is read-only.</span>
			<Button size="sm" onClick={() => void setArchived(project, false)}>
				Unarchive
			</Button>
		</div>
	);
}
