import { useNavigate } from "@tanstack/react-router";
import type { ProjectSummary } from "@trellis/api";
import { Menu, toast } from "@trellis/ui";
import { Copy, FolderPlus, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { projectSlashPath } from "../../../lib/projectPath";
import { composerActions } from "../../composer";
import { toCli } from "../../filters/cli";
import { NewSubprojectDialog } from "../NewSubprojectDialog";

export type ProjectRowActionsProps = {
	project: ProjectSummary;
};

export function ProjectRowActions({ project }: ProjectRowActionsProps) {
	const navigate = useNavigate();
	const [createOpen, setCreateOpen] = useState(false);

	const copyFilter = async () => {
		await navigator.clipboard.writeText(toCli({ project: project.path }));
		toast("Copied the CLI filter");
	};

	return (
		<>
			<Menu
				label={`Actions for ${project.name}`}
				items={[
					{ label: "New sub-project", icon: <FolderPlus />, onSelect: () => setCreateOpen(true) },
					{ label: "New ticket", icon: <Plus />, onSelect: () => composerActions.open({ project: project.path }) },
					{
						label: "Settings",
						icon: <Settings />,
						onSelect: () => {
							void navigate({
								to: "/p/$",
								params: { _splat: `${projectSlashPath(project.path)}/settings` },
								search: {},
							});
						},
					},
					{ label: "Copy CLI filter", icon: <Copy />, onSelect: () => void copyFilter() },
				]}
			/>
			<NewSubprojectDialog project={project} open={createOpen} onOpenChange={setCreateOpen} />
		</>
	);
}
