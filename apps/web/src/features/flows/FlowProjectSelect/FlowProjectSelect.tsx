import { Field, PickerButton } from "@trellis/ui";
import type { ReactNode } from "react";
import { ProjectPicker } from "../../pickers/ProjectPicker";
import { everyProjectValue } from "../flowProject";
import { useFlowProjects } from "./useFlowProjects";

export type FlowProjectSelectProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	hint?: ReactNode;
};

export function FlowProjectSelect({ value, onChange, disabled = false, hint }: FlowProjectSelectProps) {
	const projects = useFlowProjects();
	const loaded = projects.data ?? [];
	return (
		<Field
			label="Project"
			hint={
				projects.isError ? (
					<span role="alert" className="text-danger">
						Could not load the projects. Reopen this to pick a project.
					</span>
				) : (
					hint
				)
			}
		>
			<ProjectPicker
				projects={loaded}
				allowNoProject
				noProjectLabel="Every project"
				trigger={<PickerButton label="Project">{value === everyProjectValue ? "Every project" : value}</PickerButton>}
				value={value === everyProjectValue ? "" : value}
				disabled={disabled || !projects.isSuccess}
				onPick={(key) => onChange(key || everyProjectValue)}
			/>
		</Field>
	);
}
