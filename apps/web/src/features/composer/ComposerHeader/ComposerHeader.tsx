import { CaretRight, FolderOpen, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ComposerProperty, IconButton, Tooltip } from "@trellis/ui";
import { useArchivedProjects } from "../../../hooks/useArchivedProjects";
import { useApp } from "../../../lib/appContext";
import { ProjectPicker } from "../../pickers/ProjectPicker";

export function ComposerHeader({
	project,
	title,
	allowNoProject = false,
	disabled,
	locked,
	onProject,
	onClose,
}: {
	project?: string;
	title: string;
	allowNoProject?: boolean;
	disabled: boolean;
	locked: boolean;
	onProject: (project: string) => void;
	onClose: () => void;
}) {
	const { orpc } = useApp();
	const { isArchived } = useArchivedProjects();
	const projects = (useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? []).filter(
		(entry) => !isArchived(entry.key),
	);
	const selected = projects.find((entry) => entry.key === project || entry.id === project);
	return (
		<>
			<ProjectPicker
				scope={project}
				projects={projects}
				value={selected?.key ?? project}
				allowNoProject={allowNoProject}
				disabled={locked}
				onPick={onProject}
				trigger={
					<ComposerProperty
						icon={<FolderOpen />}
						aria-label={`Project: ${project || (allowNoProject ? "No project" : "Choose a project")}`}
						disabled={locked}
					>
						{selected?.name ?? (project || (allowNoProject ? "No project" : "Choose a project"))}
					</ComposerProperty>
				}
			/>
			<CaretRight className="size-2.5 shrink-0" aria-hidden="true" />
			<span className="whitespace-nowrap">{title}</span>
			<Tooltip content="Close and keep draft">
				<IconButton
					label="Close and keep draft"
					icon={<X />}
					disabled={disabled}
					onClick={onClose}
					className="ml-auto"
				/>
			</Tooltip>
		</>
	);
}
