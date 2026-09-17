import { HARNESS_DEFAULT_MODELS, type Status, type StatusAgentConfig } from "@trellis/api";
import { Button, Dialog, IconButton, Input, type ModelProvider, ProviderIcon, Tooltip } from "@trellis/ui";
import { type FormEvent, useState } from "react";
import { ColumnAgentFields } from "../../../../../agents/ColumnAgentFields";

export type ColumnSettings = {
	agentConfig: StatusAgentConfig | null;
	wipLimit: number | null;
};

const providerNames: Record<ModelProvider, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	meta: "Meta",
	google: "Google",
};

const modelFor = (config: StatusAgentConfig) =>
	config.harness.model ?? (config.harness.preset === "custom" ? null : HARNESS_DEFAULT_MODELS[config.harness.preset]);

const providerFor = (model: string) => model.slice(0, model.indexOf("/")) as ModelProvider;

export function ColumnAgentSettings({
	columnName,
	status,
	onSave,
}: {
	columnName: string;
	status: Status;
	onSave: (settings: ColumnSettings) => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [agentConfig, setAgentConfig] = useState(status.agentConfig);
	const [limit, setLimit] = useState(status.wipLimit?.toString() ?? "");
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const model = status.agentConfig === null ? null : modelFor(status.agentConfig);

	if (model === null) return null;
	const provider = providerFor(model);
	const begin = () => {
		setAgentConfig(status.agentConfig);
		setLimit(status.wipLimit?.toString() ?? "");
		setMessage(null);
		setOpen(true);
	};
	const save = async (event: FormEvent) => {
		event.preventDefault();
		const wipLimit = limit === "" ? null : Number(limit);
		if (wipLimit !== null && (!Number.isInteger(wipLimit) || wipLimit < 1)) {
			setMessage("Enter a column limit of 1 or more.");
			return;
		}
		setSaving(true);
		try {
			await onSave({ agentConfig, wipLimit });
			setOpen(false);
		} catch (error) {
			setMessage((error as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<Tooltip content={`${columnName} settings`}>
				<IconButton
					label={`Edit ${providerNames[provider]} worker settings for ${columnName}`}
					icon={<ProviderIcon provider={provider} />}
					className="text-fg-muted hover:text-fg"
					onClick={begin}
				/>
			</Tooltip>
			<Dialog
				open={open}
				onOpenChange={(next) => !saving && setOpen(next)}
				title={`${columnName} settings`}
				description="Configure the worker that starts when a ticket enters this column."
			>
				<form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
					<ColumnAgentFields value={agentConfig} onChange={setAgentConfig} />
					<Input
						label="Column limit"
						type="number"
						min={1}
						step={1}
						value={limit}
						disabled={saving}
						onChange={(event) => setLimit(event.target.value)}
					/>
					<p className="text-sm text-fg-muted">
						The limit blocks new tickets. Every ticket already in this column keeps its worker.
					</p>
					{message !== null && (
						<p role="alert" className="text-sm text-danger">
							{message}
						</p>
					)}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="quiet" disabled={saving} onClick={() => setOpen(false)}>
							Cancel
						</Button>
						<Button type="submit" variant="primary" disabled={saving} aria-busy={saving}>
							Save settings
						</Button>
					</div>
				</form>
			</Dialog>
		</>
	);
}
