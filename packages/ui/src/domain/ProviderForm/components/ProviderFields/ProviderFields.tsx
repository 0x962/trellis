import { useEffect, useId, useRef } from "react";
import { Button } from "../../../../primitives/Button";
import { Field } from "../../../../primitives/Field";
import { Input } from "../../../../primitives/Input";
import { Select } from "../../../../primitives/Select";
import { Switch } from "../../../../primitives/Switch";
import type { ProviderFieldsProps } from "../../types";

export function ProviderFields({
	value,
	onChange,
	editing = false,
	keyLast4 = "",
	busy,
	valid,
	error,
	errorField,
	models,
	onClose,
	onSubmit,
}: ProviderFieldsProps) {
	const form = useRef<HTMLFormElement>(null);
	const modelsId = useId();
	useEffect(() => {
		if (errorField && !busy) form.current?.querySelector<HTMLInputElement>(`[name="${errorField}"]`)?.focus();
	}, [errorField, busy]);
	return (
		<form
			ref={form}
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				if (valid && !busy) onSubmit();
			}}
		>
			<Input
				label="Name"
				name="name"
				value={value.name}
				onChange={(event) => onChange({ ...value, name: event.target.value })}
				required
				maxLength={120}
				placeholder="Vercel"
				autoFocus={!editing}
				disabled={busy}
				error={errorField === "name" ? error : undefined}
			/>
			<Field label="Kind" hint={value.kind === "vercel-ai-gateway" ? "ai-gateway.vercel.sh" : undefined}>
				{editing ? (
					<p className="text-sm text-fg">
						{value.kind === "vercel-ai-gateway" ? "Vercel AI Gateway" : "OpenAI-compatible"}
					</p>
				) : (
					<Select
						label="Provider kind"
						value={value.kind}
						onValueChange={(kind) => onChange({ ...value, kind })}
						disabled={busy}
						items={[
							{ value: "vercel-ai-gateway", label: "Vercel AI Gateway" },
							{ value: "openai-compatible", label: "OpenAI-compatible" },
						]}
					/>
				)}
			</Field>
			{value.kind === "openai-compatible" && (
				<Input
					label="Address"
					name="baseUrl"
					type="url"
					inputMode="url"
					autoCapitalize="off"
					placeholder="https://api.example.com"
					value={value.baseUrl}
					onChange={(event) => onChange({ ...value, baseUrl: event.target.value })}
					required
					disabled={busy}
					error={errorField === "baseUrl" ? error : undefined}
				/>
			)}
			<Input
				label="API key"
				name="apiKey"
				type="password"
				autoComplete="off"
				spellCheck={false}
				value={value.apiKey}
				onChange={(event) => onChange({ ...value, apiKey: event.target.value })}
				required={!editing}
				maxLength={4000}
				disabled={busy}
				error={errorField === "apiKey" ? error : undefined}
				placeholder={
					editing
						? keyLast4
							? `Leave blank to keep ••••${keyLast4}`
							: "Leave blank to keep the stored key"
						: value.kind === "vercel-ai-gateway"
							? "vck_…"
							: "sk-…"
				}
			/>
			<div className="flex min-w-0 flex-col gap-1">
				<label htmlFor={modelsId} className="text-sm text-fg-muted">
					Models
				</label>
				{models(modelsId)}
				<p className="text-xs text-fg-faint">
					The models Trellis offers from this provider. Type an id the list does not show, such as typesafe-ai/jev.
				</p>
			</div>
			<Switch
				label="Enabled"
				checked={value.enabled}
				onCheckedChange={(enabled) => onChange({ ...value, enabled })}
				disabled={busy}
			/>
			{error && errorField !== "name" && errorField !== "baseUrl" && errorField !== "apiKey" && (
				<p role="alert" className="text-sm text-danger">
					{error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<Button disabled={busy} onClick={onClose}>
					Cancel
				</Button>
				<Button type="submit" variant="primary" processing={busy} disabled={!valid}>
					{editing ? "Save" : "Add provider"}
				</Button>
			</div>
		</form>
	);
}
