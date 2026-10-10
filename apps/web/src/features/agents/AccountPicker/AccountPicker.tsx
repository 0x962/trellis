import type { HarnessAccount, HarnessPreset } from "@trellis/api";
import { Command, PickerButton, Popover } from "@trellis/ui";
import { useRef, useState } from "react";
import { createNameItem } from "../../pickers/utils/createNameItem";
import { AccountCreateForm } from "../AccountCreateForm";

export function AccountPicker({
	harness,
	accounts,
	value,
	disabled = false,
	scope,
	onValueChange,
}: {
	harness: HarnessPreset;
	accounts: readonly HarnessAccount[] | undefined;
	value: string | null;
	disabled?: boolean;
	scope?: string;
	onValueChange: (value: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [creation, setCreation] = useState<{ name: string; generation: number } | null>(null);
	const identity = JSON.stringify([harness, scope, disabled]);
	const previousIdentity = useRef(identity);
	const generation = useRef(0);
	if (previousIdentity.current !== identity) {
		previousIdentity.current = identity;
		generation.current++;
	}
	const input = useRef<HTMLInputElement>(null);
	const choices = (accounts ?? []).filter((account) => account.harness === harness);
	const createItem =
		accounts !== undefined && harness !== "custom"
			? createNameItem(
					"account",
					search,
					choices.map((account) => account.name),
				)
			: null;
	const current = choices.find((account) => account.id === value);
	return (
		<>
			<Popover
				label="Account"
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setSearch("");
				}}
				initialFocus={input}
				trigger={
					<PickerButton label="Account" disabled={disabled || accounts === undefined}>
						{value === null ? "Default account" : (current?.name ?? "Account unavailable")}
					</PickerButton>
				}
			>
				<Command
					label="Search accounts"
					placeholder="Search or create an account…"
					inputRef={input}
					onSearchChange={setSearch}
					items={[
						{ id: "default", label: "Default account", current: value === null },
						...choices.map((account) => ({ id: account.id, label: account.name, current: account.id === value })),
						...(createItem ? [createItem] : []),
					]}
					onSelect={(id) => {
						if (id === createItem?.id) setCreation({ name: search.trim(), generation: generation.current });
						else onValueChange(id === "default" ? null : id);
						setOpen(false);
						setSearch("");
					}}
				/>
			</Popover>
			{creation !== null && creation.generation === generation.current && harness !== "custom" && (
				<AccountCreateForm
					name={creation.name}
					scope={identity}
					harness={harness}
					onClose={() => setCreation(null)}
					onCreated={(account) => {
						if (creation.generation !== generation.current) return;
						setCreation(null);
						onValueChange(account.id);
					}}
				/>
			)}
		</>
	);
}
