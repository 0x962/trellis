import { effortForHarness, HARNESS_DEFAULT_MODELS, type HarnessEffort } from "@trellis/api";
import { Button, ChoiceBoxes, Dialog, Field, ProviderIcon, Select } from "@trellis/ui";
import { type RefObject, useState } from "react";
import { type AssignAccounts, type AssignChoice, draftFrom, modelIdOf } from "../../../../../assignChoice";
import { harnessPresets, type NativePreset } from "../../../../../harnessPresets";
import { ModelPicker } from "../../../../../ModelPicker";
import { modelProviderOf } from "../../../../../modelProviderOf";

const DEFAULT_ACCOUNT = "default";
const DEFAULT_EFFORT = "default";

// The mark of a harness is the mark of the company behind the model it
// serves by default: Anthropic for Claude, OpenAI for Codex, Meta for Muse.
const boxes = harnessPresets.map(({ value, label }) => ({
	value,
	label,
	icon: <ProviderIcon provider={modelProviderOf(HARNESS_DEFAULT_MODELS[value])!} decorative className="size-4" />,
}));

// The dialog behind "Set something else": the harness, then the model, the
// effort and the account that follow it. It holds a draft and changes
// nothing until the person presses Assign. It is mounted only while it
// shows, so each opening starts from the choice its caller hands it.
export function AssignAgentDialog({
	initial,
	accounts,
	disabled,
	finalFocus,
	onAssign,
	onClose,
}: {
	// The choice the dialog opens on: the newest stored choice, or the choice
	// of the menu row that asked for the dialog.
	initial: AssignChoice;
	accounts: AssignAccounts;
	// True where the ticket takes no agent, because it completed. The ticket
	// can complete while this dialog stands open.
	disabled: boolean;
	// The control that takes the focus back. The menu row that opened this
	// dialog is gone by the time it closes.
	finalFocus: RefObject<HTMLElement | null>;
	onAssign: (choice: AssignChoice) => void;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState(initial);
	const effort = effortForHarness(draft.preset, modelIdOf(draft));
	const harnessAccounts = (accounts ?? []).filter((account) => account.harness === draft.preset);
	return (
		<Dialog
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
			finalFocus={finalFocus}
			title="Assign an agent"
			description="Pick the harness. The model and the effort follow it."
		>
			<div className="flex min-w-0 flex-col gap-2">
				<ChoiceBoxes
					label="Harness"
					options={boxes}
					value={draft.preset}
					// The harness decides the model list, the effort list and the
					// accounts, so it starts with no value of the harness before it.
					onValueChange={(preset: NativePreset) => setDraft({ preset, model: null, effort: null, accountId: null })}
				/>
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-sm text-fg-muted">Model</span>
					<ModelPicker
						harness={draft.preset}
						value={draft.model ?? undefined}
						onValueChange={(model) => setDraft(draftFrom({ ...draft, model: model ?? null }, accounts))}
					/>
				</div>
				{/* The slot holds its height where the harness offers no effort, so
				    the dialog keeps one size across the five harnesses. */}
				<div className="flex min-h-12 min-w-0 flex-col gap-1">
					{effort && (
						<Field label={effort.label}>
							<Select
								label={effort.label}
								className="w-full"
								value={draft.effort ?? DEFAULT_EFFORT}
								items={[{ value: DEFAULT_EFFORT, label: "Harness default" }, ...effort.options]}
								onValueChange={(value) =>
									setDraft({ ...draft, effort: value === DEFAULT_EFFORT ? null : (value as HarnessEffort) })
								}
							/>
						</Field>
					)}
				</div>
				<Field label="Account">
					<Select
						label="Account"
						className="w-full"
						disabled={harnessAccounts.length === 0}
						value={draft.accountId ?? DEFAULT_ACCOUNT}
						items={[
							{ value: DEFAULT_ACCOUNT, label: "Default account" },
							...harnessAccounts.map((account) => ({ value: account.id, label: account.name })),
						]}
						onValueChange={(accountId) =>
							setDraft({ ...draft, accountId: accountId === DEFAULT_ACCOUNT ? null : accountId })
						}
					/>
				</Field>
			</div>
			<div className="flex justify-end gap-2">
				<Button variant="quiet" onClick={onClose}>
					Cancel
				</Button>
				<Button variant="primary" disabled={disabled} onClick={() => onAssign(draft)}>
					Assign
				</Button>
			</div>
		</Dialog>
	);
}
