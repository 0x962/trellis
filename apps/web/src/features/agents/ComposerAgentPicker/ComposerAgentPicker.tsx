import { UserCircle } from "@phosphor-icons/react";
import {
	effortForHarness,
	HARNESS_DEFAULT_MODELS,
	type HarnessEffort,
	type HarnessPreset,
	modelsForHarness,
} from "@trellis/api";
import { Command, ComposerProperty, Popover, ProviderIcon, Select } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import { type AssignAccounts, type AssignChoice, modelIdOf, modelNameOf } from "../AssignAgent/assignChoice";
import { harnessLabel, harnessPresets, type NativePreset } from "../harnessPresets";
import { modelProviderOf } from "../modelProviderOf";

type ComposerAgentChoice = Omit<AssignChoice, "preset"> & { preset: HarnessPreset };

export function ComposerAgentPicker({
	value,
	accounts,
	onPick,
	onEffort,
	onAccount,
	onClear,
	description,
	disabled,
}: {
	value: ComposerAgentChoice | null;
	accounts: AssignAccounts;
	onPick: (preset: NativePreset, model: string | null) => void;
	onEffort: (effort: HarnessEffort | null) => void;
	onAccount: (accountId: string | null) => void;
	onClear?: () => void;
	description?: string;
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
	const native = value && value.preset !== "custom" ? { ...value, preset: value.preset } : null;
	const provider = native && modelProviderOf(modelIdOf(native));
	const effort = native && effortForHarness(native.preset, modelIdOf(native));
	const harnessName = value?.preset === "custom" ? "Custom" : native && harnessLabel(native.preset);
	const modelName = native ? modelNameOf(native) : null;
	return (
		<Popover
			label={onClear ? "Assign agent" : "Agent"}
			open={open && !disabled}
			onOpenChange={setOpen}
			initialFocus={search}
			className="composer-agent-picker"
			trigger={
				<ComposerProperty
					aria-label={value === null ? "Assign agent" : `Agent: ${harnessName}${modelName ? `, ${modelName}` : ""}`}
					disabled={disabled}
					icon={provider ? <ProviderIcon decorative provider={provider} /> : <UserCircle />}
					detail={modelName}
				>
					{value === null ? "Assign agent" : harnessName}
				</ComposerProperty>
			}
		>
			<Command.Virtual
				label="Search agents and models"
				placeholder="Search agents and models…"
				inputRef={search}
				items={[
					...(onClear ? [{ id: "none", label: "No agent", icon: <UserCircle />, current: value === null }] : []),
					...(value?.preset === "custom" ? [{ id: "custom", label: "Custom", current: true, checked: true }] : []),
				]}
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
					if (id === "none") onClear!();
					else if (id !== "custom") {
						const option = options.find((option) => option.id === id)!;
						onPick(option.preset, option.model);
					}
					setOpen(false);
				}}
			/>
			{value && (
				<div className="composer-agent-settings">
					{effort && (
						<Select
							disabled={disabled}
							label={effort.label}
							hideLabel={false}
							value={value.effort ?? "default"}
							items={[{ value: "default", label: "Harness default" }, ...effort.options]}
							onValueChange={(next) => onEffort(next === "default" ? null : (next as HarnessEffort))}
						/>
					)}
					<Select
						label="Account"
						hideLabel={false}
						value={value.accountId ?? "default"}
						disabled={disabled || accounts === undefined}
						items={[
							{ value: "default", label: "Default account" },
							...(accounts ?? [])
								.filter((account) => account.harness === value.preset)
								.map((account) => ({ value: account.id, label: account.name })),
						]}
						onValueChange={(next) => onAccount(next === "default" ? null : next)}
					/>
				</div>
			)}
			{description && <p className="border-t border-border px-3 py-2.5 text-xs text-fg-faint">{description}</p>}
		</Popover>
	);
}
