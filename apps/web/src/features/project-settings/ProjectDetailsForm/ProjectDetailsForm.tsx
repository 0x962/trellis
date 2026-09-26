import { useSuspenseQuery } from "@tanstack/react-query";
import type { Project } from "@trellis/api";
import { Input, ProjectColorField, Textarea } from "@trellis/ui";
import { useApp } from "../../../lib/appContext";
import { takenColors } from "../../../lib/projectColors";
import type { GeneralValues } from "../ProjectGeneralSettings/ProjectGeneralSettings";

export type ProjectDetailsFormProps = {
	project: Project;
	value: GeneralValues;
	onChange: <K extends keyof GeneralValues>(key: K, value: GeneralValues[K]) => void;
	onBlur: (key: keyof GeneralValues) => void;
	disabled: boolean;
};

export function ProjectDetailsForm({ project, value, onChange, onBlur, disabled }: ProjectDetailsFormProps) {
	const { orpc } = useApp();
	const taken = useSuspenseQuery({
		...orpc.projects.list.queryOptions({ input: {} }),
		select: (projects) => takenColors(projects, project.id),
	}).data;
	const locked = project.ticketCounter > 0;
	return (
		<>
			<Input
				label="Project name"
				value={value.name}
				disabled={disabled}
				onChange={(event) => onChange("name", event.target.value)}
				onBlur={() => onBlur("name")}
			/>
			<Input
				label="Key"
				value={value.key}
				readOnly={locked}
				disabled={disabled}
				readOnlyReason={`Every ticket ID starts with ${project.key}.`}
				className="max-w-28 uppercase"
				onChange={(event) => onChange("key", event.target.value)}
				onBlur={() => onBlur("key")}
			/>
			<Textarea
				label="Description"
				rows={3}
				value={value.description}
				disabled={disabled}
				onChange={(event) => onChange("description", event.target.value)}
				onBlur={() => onBlur("description")}
			/>
			<ProjectColorField
				label="Colour"
				value={value.color}
				taken={taken}
				disabled={disabled}
				onValueChange={(value) => onChange("color", value)}
				onBlur={() => onBlur("color")}
			/>
		</>
	);
}
