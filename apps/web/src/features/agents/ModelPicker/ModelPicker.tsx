import { HARNESS_DEFAULT_MODELS, type HarnessPreset, MODEL_CATALOG, modelsForHarness } from "@trellis/api";
import { Command, PickerButton, Popover, ProviderIcon } from "@trellis/ui";
import { useRef, useState } from "react";
import { pickerListClass } from "../../pickers/pickerListClass";
import { modelProviderOf } from "../modelProviderOf";
import { modelGroups } from "./modelGroups";

const DEFAULT_MODEL = "default";

export function ModelPicker({
	harness,
	value,
	onValueChange,
	disabled = false,
	className,
}: {
	harness: Exclude<HarnessPreset, "custom">;
	value?: string;
	onValueChange: (value: string | undefined) => void;
	disabled?: boolean;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const defaultModel = HARNESS_DEFAULT_MODELS[harness];
	const selectedId = value ?? defaultModel;
	const selected = MODEL_CATALOG.find((model) => model.id === selectedId)!;
	const models = modelsForHarness(harness);
	const pick = (id: string) => {
		setOpen(false);
		onValueChange(id === DEFAULT_MODEL ? undefined : id);
	};
	return (
		<Popover
			trigger={
				<PickerButton label="Model" disabled={disabled} className={className}>
					<span className="inline-flex min-w-0 items-center gap-2">
						{modelProviderOf(selectedId) && (
							<ProviderIcon provider={modelProviderOf(selectedId)!} decorative className="size-3.5" />
						)}
						<span className="truncate">{value === undefined ? `Default · ${selected.name}` : selected.name}</span>
					</span>
				</PickerButton>
			}
			label="Model"
			open={open}
			onOpenChange={setOpen}
			initialFocus={input}
			className="w-80 p-0"
		>
			<Command
				inputRef={input}
				label="Search models"
				placeholder="Search models"
				items={[
					{
						id: DEFAULT_MODEL,
						label: `Default · ${MODEL_CATALOG.find((model) => model.id === defaultModel)!.name}`,
						keywords: [defaultModel],
						current: value === undefined,
						icon: modelProviderOf(defaultModel) ? (
							<ProviderIcon provider={modelProviderOf(defaultModel)!} decorative />
						) : undefined,
					},
				]}
				groups={modelGroups(models).map(([family, familyModels]) => ({
					heading: family,
					icon: modelProviderOf(familyModels[0]!.id) ? (
						<ProviderIcon provider={modelProviderOf(familyModels[0]!.id)!} decorative />
					) : undefined,
					items: familyModels.map((model) => ({
						id: model.id,
						label: model.name,
						keywords: [model.id],
						current: value === model.id,
					})),
				}))}
				listClassName={pickerListClass}
				empty="No models found."
				onSelect={pick}
			/>
		</Popover>
	);
}
