import { Trash } from "@phosphor-icons/react";
import { type FlowEffort, FlowEffortSchema, type FlowNodeKind, flowAgentKinds, type Persona } from "@trellis/api";
import { Button, Input, Select, type SelectItem, Textarea } from "@trellis/ui";
import { flowKinds } from "../../../kinds";
import type { StepFields } from "../../flowDraft";

type NodeInspectorProps = {
	fields: StepFields;
	issue: string | undefined;
	personas: Persona[];
	onChange: (patch: Partial<StepFields>) => void;
	onDelete: () => void;
};

// The label of the text each kind takes. A budget takes no text.
const promptLabels: Record<FlowNodeKind, string | null> = {
	agent: "Instruction",
	gate: "Question",
	loop: "Exit question",
	human: "What the person decides",
	budget: null,
};

const effortItems: SelectItem<FlowEffort | "default">[] = [
	{ value: "default", label: "Default" },
	...FlowEffortSchema.options.map((value) => ({ value, label: value })),
];

// Edits one step. Each change goes to the canvas at once, and the editor saves
// the flow a moment later.
export function NodeInspector({ fields, issue, personas, onChange, onDelete }: NodeInspectorProps) {
	const meta = flowKinds[fields.kind];
	const runsAgent = flowAgentKinds.has(fields.kind);
	const promptLabel = promptLabels[fields.kind];
	const personaItems: SelectItem<string>[] = [
		{ value: "none", label: "No persona" },
		...personas.map((persona) => ({ value: persona.id, label: persona.name })),
	];
	return (
		<aside
			aria-label="Step settings"
			className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-surface p-4 max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:h-1/2 max-md:w-full max-md:border-t max-md:border-l-0"
		>
			<header className="flex items-center gap-2">
				<span aria-hidden="true" className="inline-flex size-4 text-fg-muted *:size-full">
					<meta.icon />
				</span>
				<h2 className="text-md font-medium text-fg">{meta.label}</h2>
			</header>
			<p className="text-xs text-fg-faint">{meta.description}</p>
			<Input
				label="Title"
				required
				maxLength={120}
				invalid={fields.title.trim() === ""}
				value={fields.title}
				onChange={(event) => onChange({ title: event.target.value })}
			/>
			{runsAgent && (
				<div className="flex flex-col gap-2">
					<span className="text-sm text-fg-muted">Persona</span>
					<Select
						label="Persona"
						items={personaItems}
						value={fields.personaId ?? "none"}
						onValueChange={(value) => onChange({ personaId: value === "none" ? null : value })}
						className="w-full"
					/>
				</div>
			)}
			{promptLabel !== null && (
				<Textarea
					label={promptLabel}
					rows={10}
					maxLength={200000}
					value={fields.instruction}
					onChange={(event) => onChange({ instruction: event.target.value })}
					placeholder={
						runsAgent && fields.personaId !== null
							? "Optional. The agent reads this text after the persona instruction."
							: "Write what this step does."
					}
				/>
			)}
			{runsAgent && (
				<div className="grid grid-cols-2 gap-3">
					<Input
						label="Model"
						placeholder="Default"
						maxLength={120}
						value={fields.model ?? ""}
						onChange={(event) => onChange({ model: event.target.value.trim() === "" ? null : event.target.value })}
					/>
					<div className="flex flex-col gap-2">
						<span className="text-sm text-fg-muted">Effort</span>
						<Select
							label="Effort"
							items={effortItems}
							value={fields.effort ?? "default"}
							onValueChange={(value) => onChange({ effort: value === "default" ? null : value })}
							className="w-full"
						/>
					</div>
				</div>
			)}
			{fields.kind === "budget" && (
				<Input
					label="Minutes"
					type="number"
					min={1}
					max={1440}
					value={String(fields.minutes)}
					onChange={(event) => onChange({ minutes: event.target.valueAsNumber })}
				/>
			)}
			{fields.kind === "loop" && (
				<Input
					label="Rounds at most"
					type="number"
					min={1}
					max={50}
					value={String(fields.maxRounds)}
					onChange={(event) => onChange({ maxRounds: event.target.valueAsNumber })}
				/>
			)}
			{issue !== undefined && (
				<p role="alert" className="text-sm text-danger">
					{issue}
				</p>
			)}
			<Button variant="quiet" icon={<Trash />} className="mt-auto self-start" onClick={onDelete}>
				Delete step
			</Button>
		</aside>
	);
}
