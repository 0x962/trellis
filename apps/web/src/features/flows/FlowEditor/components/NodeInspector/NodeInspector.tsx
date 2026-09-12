import { Trash } from "@phosphor-icons/react";
import { type FlowNodeKind, flowAgentKinds, type Persona } from "@trellis/api";
import { IconButton, Input, Switch, Textarea, Tooltip } from "@trellis/ui";
import { flowKinds } from "../../../kinds";
import type { StepFields } from "../../flowDraft";
import { PersonaSelect } from "../PersonaSelect";

type NodeInspectorProps = {
	fields: StepFields;
	issue: string | undefined;
	personas: Persona[];
	onChange: (patch: Partial<StepFields>) => void;
	onDelete: () => void;
};

// The inspector labels each instruction by its purpose.
const promptLabels: Record<FlowNodeKind, string | null> = {
	agent: "Instruction",
	gate: "Question",
	loop: "Exit question",
	human: "What the person decides",
	group: null,
};

// Edits one step. Each change goes to the canvas at once, and the editor saves
// the flow a moment later.
export function NodeInspector({ fields, issue, personas, onChange, onDelete }: NodeInspectorProps) {
	const meta = flowKinds[fields.kind];
	const runsAgent = flowAgentKinds.has(fields.kind);
	const promptLabel = promptLabels[fields.kind];
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
				<Tooltip content="Delete step">
					<IconButton label="Delete step" icon={<Trash />} variant="quiet" className="ml-auto" onClick={onDelete} />
				</Tooltip>
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
					<PersonaSelect
						personas={personas}
						value={fields.personaId}
						onChange={(personaId) => onChange({ personaId })}
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
			{fields.kind === "group" && (
				<>
					<Switch
						label="Parallel"
						checked={fields.parallel ?? false}
						onCheckedChange={(parallel) => onChange({ parallel })}
					/>
					<p className="text-xs text-fg-muted">
						{fields.parallel
							? "All children start together. Connect only the group."
							: "Connect one starting step to the other children."}
					</p>
					<Switch
						label="Time limit"
						checked={fields.minutes !== null}
						onCheckedChange={(enabled) => onChange({ minutes: enabled ? 10 : null })}
					/>
					{fields.minutes !== null && (
						<Input
							label="Minutes"
							type="number"
							min={1}
							max={1440}
							value={Number.isFinite(fields.minutes) ? String(fields.minutes) : ""}
							onChange={(event) => onChange({ minutes: event.target.value === "" ? 0 : event.target.valueAsNumber })}
						/>
					)}
				</>
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
		</aside>
	);
}
