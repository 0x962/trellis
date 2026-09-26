import { FolderOpen } from "@phosphor-icons/react";
import { useState } from "react";
import { FormStatus } from "../../../../../primitives/FormStatus";
import { IconButton } from "../../../../../primitives/IconButton";
import { Input } from "../../../../../primitives/Input";
import { Select } from "../../../../../primitives/Select";
import { Textarea } from "../../../../../primitives/Textarea";
import { Tooltip } from "../../../../../primitives/Tooltip";
import { Section } from "../../../Section";

const priorities = [
	{ value: "high", label: "High" },
	{ value: "low", label: "Low" },
];

export function FieldSection() {
	const [name, setName] = useState("Operator");
	const [path, setPath] = useState("~/projects/operator");
	const [priority, setPriority] = useState("high");
	return (
		<Section name="Field" note="Default, disabled, invalid, read-only, trailing action" className="items-start">
			<div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				<Input
					label="Default"
					hint="The name identifies the project."
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				<Input label="Disabled" hint="The name identifies the project." disabled value="Archived project" />
				<Input label="Invalid" hint="A prefix for ticket IDs." error="Use uppercase letters." defaultValue="op" />
				<Input label="Read-only" readOnly value="OP" readOnlyReason="Every ticket ID starts with OP." />
				<Input
					label="Trailing action"
					value={path}
					onChange={(event) => setPath(event.target.value)}
					hint="The agent works in this folder."
					trailingAction={
						<Tooltip content="Choose folder">
							<IconButton label="Choose folder" icon={<FolderOpen />} onClick={() => setPath("~/projects/selected")} />
						</Tooltip>
					}
				/>
				<Select
					label="Select"
					hideLabel={false}
					hint="The priority sets the ticket order."
					items={priorities}
					value={priority}
					onValueChange={setPriority}
					className="w-full h-8"
				/>
				<Textarea
					label="Textarea"
					hint="The description gives the agent its task."
					rows={3}
					defaultValue="Check the arrival list."
				/>
				<div className="flex flex-col gap-1">
					<FormStatus status="idle" message="Unsaved changes" />
					<FormStatus status="saving" message="Save in progress" />
					<FormStatus status="saved" message="Saved" />
					<FormStatus status="error" message="The server refused the save." />
				</div>
			</div>
		</Section>
	);
}
