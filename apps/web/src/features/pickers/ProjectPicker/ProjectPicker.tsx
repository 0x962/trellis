import { useQuery } from "@tanstack/react-query";
import type { ProjectSummary } from "@trellis/api";
import { Folder } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "../../../lib/appContext";
import { projectSlashPath } from "../../../lib/projectPath";
import { PickerPopover } from "../PickerPopover";

export type ProjectPickerProps = {
	trigger: ReactElement;
	// The API path of the current project: `CDE.web`.
	value: string;
	onPick: (project: ProjectSummary) => void;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The server's reason for refusing the last pick, shown inside the picker.
	error?: string | null;
};

// Every project in tree order, named by its slash path. A ticket never
// leaves its root, so the server's refusal shows here, not in a toast.
export function ProjectPicker({ trigger, value, onPick, open, onOpenChange, error }: ProjectPickerProps) {
	const { orpc } = useApp();
	const projects = useQuery(orpc.projects.list.queryOptions({ input: {} })).data ?? [];
	return (
		<PickerPopover
			trigger={trigger}
			label="Projects"
			placeholder="Move to project"
			options={projects.map((project) => ({
				id: project.path,
				label: projectSlashPath(project.path),
				hint: project.name,
				icon: <Folder />,
			}))}
			selectedId={value}
			onPick={(path) => onPick(projects.find((project) => project.path === path)!)}
			open={open}
			onOpenChange={onOpenChange}
			error={error}
		/>
	);
}
