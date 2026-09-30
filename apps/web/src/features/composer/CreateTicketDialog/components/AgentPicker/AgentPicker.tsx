import { UserCircle } from "@phosphor-icons/react";
import { effortForHarness, HARNESS_DEFAULT_MODELS, type HarnessEffort, modelsForHarness } from "@trellis/api";
import { Command, ComposerProperty, Popover, ProviderIcon, Select } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import {
	type AssignAccounts,
	type AssignChoice,
	modelIdOf,
	modelNameOf,
	withoutLostValues,
} from "../../../../agents/AssignAgent/assignChoice";
import { harnessLabel, harnessPresets } from "../../../../agents/harnessPresets";
import { modelProviderOf } from "../../../../agents/modelProviderOf";

export function AgentPicker({
	value,
	accounts,
	onChange,
	disabled,
}: {
	value: AssignChoice | null;
	accounts: AssignAccounts;
	onChange: (choice: AssignChoice | null) => void;
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const search = useRef<HTMLInputElement>(null);
	const options = useMemo(
		() =>
			harnessPresets.flatMap(({ value: preset, label }) => [
				{
					id: `${preset}:default`,
					preset,
					model: null,
					name: `${label} default`,
					group: label,
					provider: modelProviderOf(HARNESS_DEFAULT_MODELS[preset]),
				},
				...modelsForHarness(preset).map((model) => ({
					id: `${preset}:${model.id}`,
					preset,
					model: model.id,
					name: model.name,
					group: label,
					provider: modelProviderOf(model.id),
				})),
			]),
		[],
	);
	const provider = value === null ? null : modelProviderOf(modelIdOf(value));
	const effort = value === null ? null : effortForHarness(value.preset, modelIdOf(value));
	return (
		<Popover
			label="Assign agent"
			open={open}
			onOpenChange={setOpen}
			initialFocus={search}
			className="composer-agent-picker"
			trigger={
				<ComposerProperty
					aria-label={value === null ? "Assign agent" : `Agent: ${harnessLabel(value.preset)}, ${modelNameOf(value)}`}
					disabled={disabled}
					icon={provider ? <ProviderIcon decorative provider={provider} /> : <UserCircle />}
					detail={value && modelNameOf(value)}
				>
					{value === null ? "Assign agent" : harnessLabel(value.preset)}
				</ComposerProperty>
			}
		>
			<Command.Virtual
				label="Search agents and models"
				placeholder="Search agents and models…"
				inputRef={search}
				items={[{ id: "none", label: "No agent", icon: <UserCircle />, current: value === null }]}
				groups={harnessPresets.map(({ label }) => ({
					heading: label,
					items: options
						.filter((option) => option.group === label)
						.map((option) => ({
							id: option.id,
							label: option.name,
							keywords: [option.preset, option.group],
							icon: option.provider ? <ProviderIcon provider={option.provider} decorative /> : undefined,
							current: value?.preset === option.preset && value?.model === option.model,
							checked: value?.preset === option.preset && value?.model === option.model,
						})),
				}))}
				onSelect={(id) => {
					if (id === "none") onChange(null);
					else {
						const option = options.find((option) => option.id === id)!;
						onChange(
							withoutLostValues(
								{
									preset: option.preset,
									model: option.model,
									effort: value?.preset === option.preset ? value.effort : null,
									accountId: value?.preset === option.preset ? value.accountId : null,
								},
								accounts,
							),
						);
					}
					setOpen(false);
				}}
			/>
			{value && (
				<div className="composer-agent-settings">
					{effort && (
						<Select
							label={effort.label}
							hideLabel={false}
							value={value.effort ?? "default"}
							items={[{ value: "default", label: "Harness default" }, ...effort.options]}
							onValueChange={(next) =>
								onChange({ ...value, effort: next === "default" ? null : (next as HarnessEffort) })
							}
						/>
					)}
					<Select
						label="Account"
						hideLabel={false}
						value={value.accountId ?? "default"}
						disabled={accounts === undefined}
						items={[
							{ value: "default", label: "Default account" },
							...(accounts ?? [])
								.filter((account) => account.harness === value.preset)
								.map((account) => ({ value: account.id, label: account.name })),
						]}
						onValueChange={(next) => onChange({ ...value, accountId: next === "default" ? null : next })}
					/>
				</div>
			)}
			<p className="border-t border-border px-3 py-2.5 text-xs text-fg-faint">
				{value ? "The agent starts when you create the ticket." : "Create the ticket now. Assign an agent later."}
			</p>
		</Popover>
	);
}
