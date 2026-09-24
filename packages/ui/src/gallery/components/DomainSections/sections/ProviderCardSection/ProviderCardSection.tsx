import { ArrowClockwise, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { FailureState } from "../../../../../domain/FailureState";
import { ProviderCard, type ProviderCardData } from "../../../../../domain/ProviderCard";
import { ProviderForm, type ProviderFormValue, ProviderModelsPicker } from "../../../../../domain/ProviderForm";
import { ConfirmDialog } from "../../../../../primitives/ConfirmDialog";
import { IconButton } from "../../../../../primitives/IconButton";
import { SectionHeader } from "../../../../../primitives/SectionHeader";
import { Skeleton } from "../../../../../primitives/Skeleton";
import { Tooltip } from "../../../../../primitives/Tooltip";
import { Section } from "../../../Section";

const provider: ProviderCardData = {
	name: "Vercel",
	kind: "vercel-ai-gateway",
	baseUrl: "https://ai-gateway.vercel.sh",
	keyLast4: "1234",
	enabled: true,
	models: ["typesafe-ai/jev", "anthropic/claude-opus-5", "openai/gpt-6-astra"],
};
const initial: ProviderFormValue = {
	name: "",
	kind: "vercel-ai-gateway",
	baseUrl: "",
	apiKey: "",
	models: [],
	enabled: true,
};
const states = [
	{ name: "Balance", check: { ok: true, balance: "95.50", detail: null } },
	{ name: "Accepted", check: { ok: true, balance: null, detail: null } },
	{ name: "Refused", check: { ok: false, balance: null, detail: "The provider refused the key." } },
	{ name: "Forbidden", check: { ok: false, balance: null, detail: "The provider refused the request." } },
	{ name: "Unreachable", check: { ok: false, balance: null, detail: "Trellis cannot reach ai-gateway.vercel.sh." } },
	{ name: "Disabled", check: { ok: true, balance: "95.50", detail: null } },
	{ name: "Checking", check: undefined },
] as const;

export function ProviderCardSection() {
	const [form, setForm] = useState<"add" | "edit" | null>(null);
	const [value, setValue] = useState(initial);
	const [remove, setRemove] = useState(false);
	const [fetchedAt, setFetchedAt] = useState("2026-01-01T12:00:00Z");
	const openForm = (mode: "add" | "edit") => {
		setValue(mode === "add" ? initial : { ...initial, ...provider, models: [...provider.models] });
		setForm(mode);
	};
	return (
		<Section
			name="Provider card"
			note="Key states, Add and Edit forms, model choices, and removal."
			className="flex-col items-stretch"
		>
			<SectionHeader
				title="Providers"
				count={0}
				actions={
					<Tooltip content="Add provider">
						<IconButton label="Add provider" icon={<Plus />} onClick={() => openForm("add")} />
					</Tooltip>
				}
			/>
			<p className="text-sm text-fg-muted">No providers. Add a provider to give Trellis a key.</p>
			<div role="status" aria-label="Load providers">
				<span className="sr-only">Load providers</span>
				<Skeleton height="h-32" />
			</div>
			<FailureState
				variant="section"
				title="Trellis cannot read the providers."
				detail="The server is unavailable."
				action={
					<Tooltip content="Retry">
						<IconButton label="Retry" icon={<ArrowClockwise />} />
					</Tooltip>
				}
			/>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{states.map((state) => (
					<ProviderCard
						key={state.name}
						provider={{
							...provider,
							name: state.name,
							enabled: state.name !== "Disabled",
							kind: state.name === "Accepted" ? "openai-compatible" : "vercel-ai-gateway",
						}}
						check={state.check}
						checking={state.name === "Checking"}
						onEdit={() => openForm("edit")}
						onCheck={() => {}}
						onToggle={() => {}}
						onRemove={() => setRemove(true)}
					/>
				))}
			</div>
			<ProviderModelsPicker
				value={value.models}
				onChange={(models) => setValue({ ...value, models })}
				models={[
					{ id: "typesafe-ai/jev", name: "Jev" },
					{ id: "openai/gpt-6-astra", name: "GPT-6 Astra" },
				]}
				fetchedAt={fetchedAt}
				validId={(id) => id.length > 0 && id.length <= 200 && !/[\s\p{Cc}]/u.test(id)}
				onRefresh={() => setFetchedAt(new Date().toISOString())}
			/>
			{form && (
				<ProviderForm
					open
					editing={form === "edit"}
					keyLast4="1234"
					value={value}
					onChange={setValue}
					busy={false}
					valid={Boolean(value.name.trim() && (form === "edit" || value.apiKey.trim()))}
					onClose={() => setForm(null)}
					onSubmit={() => setForm(null)}
					models={(id) => (
						<ProviderModelsPicker
							id={id}
							value={value.models}
							onChange={(models) => setValue({ ...value, models })}
							models={value.kind === "openai-compatible" ? [] : [{ id: "typesafe-ai/jev", name: "Jev" }]}
							typedOnly={value.kind === "openai-compatible"}
							validId={(model) => model.length > 0 && !/\s/u.test(model)}
							onRefresh={() => {}}
						/>
					)}
				/>
			)}
			<ConfirmDialog
				open={remove}
				title="Remove Vercel?"
				description="Trellis forgets the key of this provider. Nothing at the provider changes."
				confirmLabel="Remove provider"
				danger
				onCancel={() => setRemove(false)}
				onConfirm={() => setRemove(false)}
			/>
		</Section>
	);
}
