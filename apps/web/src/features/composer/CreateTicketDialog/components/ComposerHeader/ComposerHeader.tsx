import { CaretRight, FolderOpen, X } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { ComposerProperty, IconButton, Tooltip } from "@trellis/ui";
import { useArchivedProjects } from "../../../../../hooks/useArchivedProjects";
import { useApp } from "../../../../../lib/appContext";
import { ProjectPicker } from "../../../../pickers/ProjectPicker";

export function ComposerHeader({
	project,
	disabled,
	locked,
	onProject,
	onClose,
}: {
	project?: string;
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
				projects={projects}
				value={project}
				onPick={onProject}
				trigger={
					<ComposerProperty
						icon={<FolderOpen />}
						aria-label={`Project: ${project ?? "Choose a project"}`}
						disabled={locked}
					>
						{selected?.name ?? project ?? "Choose a project"}
					</ComposerProperty>
				}
			/>
			<CaretRight className="size-2.5 shrink-0" aria-hidden="true" />
			<span className="whitespace-nowrap">New ticket</span>
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
