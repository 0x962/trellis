import {
	ConfirmDialog,
	EmptyState,
	ProviderCard,
	type ProviderCardProps,
	ProviderForm,
	type ProviderFormValue,
	ProviderModelsPicker,
} from "@trellis/ui";
import { useState } from "react";
import { useStoryState } from "../../../useStoryState";

export function ProviderCardExample(args: ProviderCardProps) {
	const [provider, setProvider] = useStoryState(args.provider);
	const [check, setCheck] = useStoryState(args.check);
	const [error, setError] = useStoryState(args.error);
	const [editing, setEditing] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [removed, setRemoved] = useState(false);
	const [value, setValue] = useState<ProviderFormValue>({
		...args.provider,
		models: [...args.provider.models],
		apiKey: "",
	});
	const card = (
		<ProviderCard
			{...args}
			provider={provider}
			check={check}
			error={error}
			onEdit={() => {
				setValue({ ...provider, models: [...provider.models], apiKey: "" });
				setEditing(true);
			}}
			onCheck={() => {
				setCheck({ ok: true, balance: "95.50", detail: null });
				setError(undefined);
			}}
			onToggle={() => setProvider({ ...provider, enabled: !provider.enabled })}
			onRemove={() => setRemoving(true)}
		/>
	);
	return (
		<>
			{removed ? (
				<EmptyState title="No local provider" description="The fixture provider was removed." />
			) : args.variant === "compact" ? (
				<ul>{card}</ul>
			) : (
				card
			)}
			<ProviderForm
				open={editing}
				editing
				keyLast4={provider.keyLast4}
				value={value}
				onChange={setValue}
				busy={false}
				valid={Boolean(value.name.trim())}
				onClose={() => setEditing(false)}
				onSubmit={() => {
					setProvider({ ...provider, ...value, keyLast4: value.apiKey ? value.apiKey.slice(-4) : provider.keyLast4 });
					setEditing(false);
				}}
				models={(id) => (
					<ProviderModelsPicker
						id={id}
						value={value.models}
						onChange={(models) => setValue({ ...value, models })}
						models={provider.models.map((model) => ({ id: model, name: model }))}
						validId={(model) => model.length > 0 && !/\s/u.test(model)}
						onRefresh={() => {}}
					/>
				)}
			/>
			<ConfirmDialog
				open={removing}
				title={`Remove ${provider.name}?`}
				description="Remove this local fixture provider."
				confirmLabel="Remove provider"
				danger
				onCancel={() => setRemoving(false)}
				onConfirm={() => {
					setRemoved(true);
					setRemoving(false);
				}}
			/>
		</>
	);
}
