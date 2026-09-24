import { ArrowClockwise, PencilSimple, Power, Trash } from "@phosphor-icons/react";
import { CodeText } from "../../primitives/CodeText";
import { IconButton } from "../../primitives/IconButton";
import { Skeleton } from "../../primitives/Skeleton";
import { Tooltip } from "../../primitives/Tooltip";
import { ProviderIcon } from "../ProviderIcon";

export type ProviderCardData = {
	name: string;
	kind: "vercel-ai-gateway" | "openai-compatible";
	baseUrl: string;
	keyLast4: string;
	enabled: boolean;
	models: readonly string[];
};

export type ProviderCardProps = {
	provider: ProviderCardData;
	check?: { ok: boolean; balance: string | null; detail: string | null };
	checking: boolean;
	busy?: boolean;
	error?: string;
	onEdit: () => void;
	onCheck: () => void;
	onToggle: () => void;
	onRemove: () => void;
};

export function ProviderCard({
	provider,
	check,
	checking,
	busy,
	error,
	onEdit,
	onCheck,
	onToggle,
	onRemove,
}: ProviderCardProps) {
	const refused = !error && check?.detail === "The provider refused the key.";
	const forbidden = !error && check?.detail === "The provider refused the request.";
	const models = provider.models.join(", ");
	return (
		<article aria-label={provider.name} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<h3 className="flex min-w-0 items-center gap-2 text-md font-medium text-fg">
						<ProviderIcon
							provider={provider.kind === "vercel-ai-gateway" ? "vercel" : "openai-compatible"}
							decorative
							className="text-fg-muted"
						/>
						<span className="break-words">{provider.name}</span>
					</h3>
					<p className="mt-1 text-xs text-fg-faint">
						{provider.kind === "vercel-ai-gateway" ? "Vercel AI Gateway" : "OpenAI-compatible"}
						{!provider.enabled && " · Off"}
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-1">
					<Tooltip content="Edit provider">
						<IconButton label={`Edit ${provider.name}`} icon={<PencilSimple />} disabled={busy} onClick={onEdit} />
					</Tooltip>
					<Tooltip content="Check key">
						<IconButton
							label={`Check the key of ${provider.name}`}
							icon={<ArrowClockwise />}
							disabled={checking || busy}
							aria-busy={checking}
							onClick={onCheck}
						/>
					</Tooltip>
					<Tooltip content={provider.enabled ? "Turn off" : "Turn on"}>
						<IconButton
							label={`${provider.enabled ? "Turn off" : "Turn on"} ${provider.name}`}
							icon={<Power />}
							pressed={provider.enabled}
							disabled={busy}
							onClick={onToggle}
						/>
					</Tooltip>
					<Tooltip content="Remove provider">
						<IconButton label={`Remove ${provider.name}`} icon={<Trash />} disabled={busy} onClick={onRemove} />
					</Tooltip>
				</div>
			</div>
			<CodeText className="break-all text-xs text-fg-faint">{provider.baseUrl}</CodeText>
			<p className="text-sm text-fg-muted">Key ••••{provider.keyLast4}</p>
			<div className="min-h-10">
				{checking ? (
					<div className="flex flex-col gap-1">
						<p role="status" className="text-sm text-fg-muted">
							Checking the key…
						</p>
						<Skeleton width="w-16" height="h-4" />
					</div>
				) : check?.ok && !error ? (
					<p role="status" className="text-sm text-success">
						Key accepted
						{check.balance !== null && (
							<>
								{" "}
								· <span className="tabular">${check.balance}</span> left
							</>
						)}
					</p>
				) : (
					<p role="status" className={`text-sm ${refused || forbidden ? "text-warning" : "text-fg-muted"}`}>
						{refused
							? "The provider refused the key. Paste a new key in Edit."
							: forbidden
								? "The provider refused the request. Check the key and the plan at the provider."
								: `${error ?? check?.detail ?? "The key has not been checked."} Check the key again later.`}
					</p>
				)}
			</div>
			{provider.models.length ? (
				<Tooltip content={models}>
					<p className="truncate text-sm text-fg-muted">
						{provider.models.length} {provider.models.length === 1 ? "model" : "models"} · {models}
					</p>
				</Tooltip>
			) : (
				<p className="text-sm text-fg-muted">No models. Edit the provider to choose some.</p>
			)}
		</article>
	);
}
