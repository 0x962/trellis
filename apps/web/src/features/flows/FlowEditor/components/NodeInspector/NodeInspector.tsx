import type { FlowNodeKind } from "@trellis/api";
import { Button, Input, Sheet, SheetBody, SheetFooter, SheetSection, Switch, Textarea } from "@trellis/ui";
import { useState } from "react";
import { flowKinds } from "../../../kinds";
import type { StepFields } from "../../flowDraft";

type NodeInspectorProps = {
	fields: StepFields;
	issue: string | undefined;
	validate: (fields: StepFields) => { canSave: boolean; issue: string | undefined };
	onDelete: () => void;
	onClose: () => void;
	onSave: (fields: StepFields) => void;
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

export function NodeInspector({
	fields: initialFields,
	issue,
	validate,
	onDelete,
	onClose,
	onSave,
	saving,
	canSave,
}: NodeInspectorProps) {
	const [fields, setFields] = useState(initialFields);
	const onChange = (patch: Partial<StepFields>) => setFields((current) => ({ ...current, ...patch }));
	const validation = validate(fields);
	const shownIssue = issue ?? validation.issue;
	const meta = flowKinds[fields.kind];
	const promptLabel = promptLabels[fields.kind];
	return (
		<Sheet
			open
			modal={false}
			title={`Edit ${meta.label.toLowerCase()}`}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !saving && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (canSave && validation.canSave && !saving) onSave(fields);
				}}
			>
				<SheetBody>
					<fieldset disabled={saving} className="contents">
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
						</SheetSection>
						{promptLabel !== null && (
							<SheetSection title="Instructions" divided>
								<Textarea
									label={promptLabel}
									rows={14}
									maxLength={200000}
									value={fields.instruction}
									onChange={(event) => onChange({ instruction: event.target.value })}
									placeholder="Write what this step does."
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
						{shownIssue !== undefined && (
							<p role="alert" className="text-sm text-danger">
								{shownIssue}
							</p>
						)}
					</fieldset>
				</SheetBody>
				<SheetFooter
					leading={
						<Button type="button" variant="quiet" onClick={onDelete} disabled={saving}>
							Delete step
						</Button>
					}
				>
					<Button type="button" variant="quiet" onClick={onClose} disabled={saving}>
						Cancel
					</Button>
					<Button type="submit" variant="primary" processing={saving} disabled={!canSave || !validation.canSave}>
						Save changes
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
