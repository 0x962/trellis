import { useQuery } from "@tanstack/react-query";
import { HARNESS_DEFAULT_MODELS, type HarnessPreset, type StatusAgentConfig, type UsageAccount } from "@trellis/api";
import { IconButton, type ModelProvider, ProviderIcon, Tooltip } from "@trellis/ui";
import { useApp } from "../../../../../../lib/appContext";

const providerNames: Record<ModelProvider, string> = {
	anthropic: "Anthropic",
	openai: "OpenAI",
	meta: "Meta",
	google: "Google",
};

const harnessNames: Record<HarnessPreset, string> = {
	claude: "Claude Code",
	codex: "Codex",
	opencode: "OpenCode",
	pi: "Pi",
	muse: "Muse",
	custom: "Custom command",
};

const modelFor = (config: StatusAgentConfig) =>
	config.harness.model ?? (config.harness.preset === "custom" ? null : HARNESS_DEFAULT_MODELS[config.harness.preset]);

const providerFor = (model: string) => model.slice(0, model.indexOf("/")) as ModelProvider;

const quotaText = (account: UsageAccount | undefined, preset: HarnessPreset, accountId: string | null) => {
	if (account === undefined) {
		if (accountId !== null) return "Unavailable";
		return preset === "opencode" || preset === "pi" ? "Unlimited" : "Unavailable";
	}
	if (account.quota.status === "ok")
		return account.quota.windows.map((window) => `${window.label}: ${window.usedPercent}% used`).join(" · ");
	if (account.quota.status === "unlimited") return "Unlimited";
	if (account.quota.status === "signed_out") return "Sign in required";
	if (account.quota.status === "expired") return "Sign-in expired";
	return "Unavailable";
};

export function ColumnAgentBadge({ columnName, config }: { columnName: string; config: StatusAgentConfig }) {
	const { orpc } = useApp();
	const personas = useQuery(orpc.personas.list.queryOptions({ input: {} }));
	const accounts = useQuery({ ...orpc.usage.accounts.queryOptions({ input: {} }), refetchInterval: 300_000 });
	const model = modelFor(config);
	if (model === null) return null;
	const provider = providerFor(model);
	const persona = personas.data?.find((candidate) => candidate.id === config.personaId);
	const account = accounts.data?.find((candidate) =>
		config.accountId === null
			? candidate.harness === config.harness.preset && candidate.isDefault
			: candidate.id === config.accountId,
	);
	const accountName = accounts.isPending
		? "Loading…"
		: (account?.name ?? (config.accountId === null ? "Harness default" : "Unavailable"));
	const usage = accounts.isPending
		? "Loading…"
		: accounts.isError
			? "Unavailable"
			: quotaText(account, config.harness.preset, config.accountId);

	return (
		<Tooltip
			side="bottom"
			content={`${columnName} worker`}
			description={
				<span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
					<span className="text-fg-faint">Model</span>
					<span className="break-all text-end font-mono text-fg">{model}</span>
					<span className="text-fg-faint">Harness</span>
					<span className="text-end text-fg">{harnessNames[config.harness.preset]}</span>
					<span className="text-fg-faint">Effort</span>
					<span className="text-end text-fg">{config.harness.effort ?? "Default"}</span>
					<span className="text-fg-faint">Persona</span>
					<span className="text-end text-fg">{personas.isPending ? "Loading…" : (persona?.name ?? "Unavailable")}</span>
					<span className="text-fg-faint">Account</span>
					<span className="min-w-0 truncate text-end text-fg">{accountName}</span>
					<span className="text-fg-faint">Usage</span>
					<span className="text-end text-fg">{usage}</span>
				</span>
			}
		>
			<IconButton
				label={`Show ${providerNames[provider]} worker details for ${columnName}`}
				icon={
					<span>
						<ProviderIcon provider={provider} />
					</span>
				}
				className="text-fg-muted hover:text-fg"
			/>
		</Tooltip>
	);
}
