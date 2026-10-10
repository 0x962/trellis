import { Field, PickerButton } from "@trellis/ui";
import { type ReactNode, useId } from "react";
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
	const controlId = useId();
	const loaded = projects.data ?? [];
	const message = projects.isError ? (
		<span role="alert" className="text-danger">
			Could not load the projects. Reopen this to pick a project.
		</span>
	) : (
		hint
	);
	return (
		<ProjectPicker
			id={controlId}
			aria-describedby={message === undefined || message === null ? undefined : `${controlId}-hint`}
			wrapPicker={(picker) => (
				<Field id={controlId} label="Project" hint={message}>
					{picker}
				</Field>
			)}
			projects={loaded}
			allowNoProject
			noProjectLabel="Every project"
			trigger={<PickerButton label="Project">{value === everyProjectValue ? "Every project" : value}</PickerButton>}
			value={value === everyProjectValue ? "" : value}
			disabled={disabled || !projects.isSuccess}
			onPick={(key) => onChange(key || everyProjectValue)}
		/>
	);
}
