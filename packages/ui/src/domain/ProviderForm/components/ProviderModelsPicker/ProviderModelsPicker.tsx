import { ArrowClockwise } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { Chip } from "../../../../primitives/Chip";
import { Command } from "../../../../primitives/Command";
import { IconButton } from "../../../../primitives/IconButton";
import { PickerButton } from "../../../../primitives/PickerButton";
import { Popover } from "../../../../primitives/Popover";
import { Tooltip } from "../../../../primitives/Tooltip";
import { modelGroups } from "./modelGroups";

export type ProviderModelsPickerProps = {
	id?: string;
	value: string[];
	onChange: (value: string[]) => void;
	models: readonly { id: string; name: string }[];
	detail?: string | null;
	fetchedAt?: string;
	pending?: boolean;
	disabled?: boolean;
	typedOnly?: boolean;
	validId: (value: string) => boolean;
	onRefresh: () => void;
};

export function ProviderModelsPicker({
	id,
	value,
	onChange,
	models,
	detail,
	fetchedAt,
	pending,
	disabled,
	typedOnly,
	validId,
	onRefresh,
}: ProviderModelsPickerProps) {
	const [search, setSearch] = useState("");
	const [open, setOpen] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const typed = search.trim();
	const choices = [
		...models,
		...value
			.filter((entry) => !models.some((model) => model.id === entry))
			.map((entry) => ({ id: entry, name: entry })),
	];
	const add =
		typed &&
		validId(typed) &&
		!choices.some((model) => model.id === typed || model.name.toLowerCase() === typed.toLowerCase());
	const toggle = (model: string) =>
		onChange(value.includes(model) ? value.filter((entry) => entry !== model) : [...value, model]);
	const stale = fetchedAt !== undefined && Date.now() - Date.parse(fetchedAt) > 5 * 60_000;
	return (
		<div className="flex min-w-0 flex-col gap-3">
			<Popover
				label="Provider models"
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setSearch("");
				}}
				initialFocus={input}
				className="w-96 max-w-[calc(100vw-2rem)] p-0 max-md:w-[calc(100vw-2rem)]"
				trigger={
					<PickerButton id={id} label="Choose provider models" disabled={disabled}>
						{value.length ? `${value.length} ${value.length === 1 ? "model" : "models"}` : "No models"}
					</PickerButton>
				}
			>
				{pending && (
					<p role="status" className="px-3 py-2 text-sm text-fg-muted">
						Load models
					</p>
				)}
				{detail && (
					<p role="status" className="px-3 py-2 text-sm text-fg-muted">
						{detail} Type the ids.
					</p>
				)}
				{typedOnly && (
					<p className="px-3 py-2 text-sm text-fg-muted">
						Type the model ids that the endpoint serves, such as qwen2.5-coder:7b.
					</p>
				)}
				{stale && (
					<div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-fg-muted">
						<span>
							Models from {new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
						</span>
						<Tooltip content="Refresh models">
							<IconButton
								label="Refresh models"
								icon={<ArrowClockwise />}
								disabled={pending}
								aria-busy={pending}
								onClick={onRefresh}
							/>
						</Tooltip>
					</div>
				)}
				<Command
					className="pointer-coarse:[&_[cmdk-item]]:h-11"
					label="Search models"
					placeholder="Search models"
					inputRef={input}
					onSearchChange={setSearch}
					empty="No model matches. Press Enter to add the typed id."
					items={add ? [{ id: `Add model ${typed}`, label: `Add ${typed}`, pinned: true }] : []}
					groups={modelGroups(choices, value)}
					onSelect={(selected) => toggle(add && selected === `Add model ${typed}` ? typed : selected)}
				/>
			</Popover>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-x-3 gap-y-4 py-2">
					{value.map((model) => (
						<Chip
							key={model}
							label=""
							op=""
							value={model}
							removeLabel={`Remove ${model}`}
							onRemove={disabled ? undefined : () => toggle(model)}
							className="max-w-full [&>span]:truncate"
						/>
					))}
				</div>
			)}
		</div>
	);
}
