import { type FlowNodeKind, flowAgentKinds, type Persona } from "@trellis/api";
import { Button, Input, Sheet, SheetBody, SheetFooter, SheetSection, Switch, Textarea } from "@trellis/ui";
import { flowKinds } from "../../../kinds";
import type { StepFields } from "../../flowDraft";
import { PersonaSelect } from "../PersonaSelect";

type NodeInspectorProps = {
	fields: StepFields;
	issue: string | undefined;
	personas: Persona[];
	onChange: (patch: Partial<StepFields>) => void;
	onDelete: () => void;
	onClose: () => void;
	onSave: () => void;
	saving: boolean;
	canSave: boolean;
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
export function NodeInspector({
	fields,
	issue,
	personas,
	onChange,
	onDelete,
	onClose,
	onSave,
	saving,
	canSave,
}: NodeInspectorProps) {
	const meta = flowKinds[fields.kind];
	const runsAgent = flowAgentKinds.has(fields.kind);
	const promptLabel = promptLabels[fields.kind];
	return (
		<Sheet
			open
			modal={false}
			title={`Edit ${meta.label.toLowerCase()}`}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && onClose()}
		>
			<div className="flex min-h-full flex-col">
				<SheetBody>
					<p className="text-sm text-fg-muted">{meta.description}</p>
					<SheetSection title="Details">
						<Input
							label="Title"
							className="pointer-coarse:h-11"
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
					</SheetSection>
					{promptLabel !== null && (
						<SheetSection title="Instructions" divided>
							<Textarea
								label={promptLabel}
								rows={14}
								maxLength={200000}
								value={fields.instruction}
								onChange={(event) => onChange({ instruction: event.target.value })}
								placeholder={
									runsAgent && fields.personaId !== null
										? "Optional. The agent reads this text after the persona instruction."
										: "Write what this step does."
								}
							/>
						</SheetSection>
					)}
					{fields.kind === "group" && (
						<SheetSection title="Execution" divided>
							<div className="flex flex-col gap-2">
								<Switch
									label="Parallel"
									className="flex-row-reverse justify-between text-sm"
									checked={fields.parallel === true}
									onCheckedChange={(parallel) => onChange({ parallel })}
								/>
								<p className="text-xs text-fg-muted">
									{fields.parallel
										? "All children start together. Connect only the group."
										: "Connect one starting step to the other children."}
								</p>
							</div>
							<div className="flex flex-col gap-3 border-t border-border pt-4">
								<Switch
									label="Time limit"
									className="flex-row-reverse justify-between text-sm"
									checked={fields.minutes !== null}
									onCheckedChange={(enabled) => onChange({ minutes: enabled ? 10 : null })}
								/>
								{fields.minutes !== null && (
									<Input
										label="Minutes"
										className="tabular-nums pointer-coarse:h-11"
										type="number"
										min={1}
										max={1440}
										value={Number.isFinite(fields.minutes) ? String(fields.minutes) : ""}
										onChange={(event) =>
											onChange({ minutes: event.target.value === "" ? 0 : event.target.valueAsNumber })
										}
									/>
								)}
							</div>
						</SheetSection>
					)}
					{fields.kind === "loop" && (
						<SheetSection title="Execution" divided>
							<Input
								label="Rounds at most"
								className="tabular-nums pointer-coarse:h-11"
								type="number"
								min={1}
								max={50}
								value={String(fields.maxRounds)}
								onChange={(event) => onChange({ maxRounds: event.target.valueAsNumber })}
							/>
						</SheetSection>
					)}
					{issue !== undefined && (
						<p role="alert" className="text-sm text-danger">
							{issue}
						</p>
					)}
				</SheetBody>
				<SheetFooter
					leading={
						<Button type="button" variant="quiet" onClick={onDelete}>
							Delete step
						</Button>
					}
				>
					<Button type="button" variant="primary" onClick={onSave} processing={saving} disabled={!canSave}>
						Save
					</Button>
				</SheetFooter>
			</div>
		</Sheet>
	);
}
