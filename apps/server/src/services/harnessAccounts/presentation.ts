import type { HarnessAccount } from "@trellis/api";
import type { AccountRow } from "./queries.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
export const presentAccount = (account: AccountRow): HarnessAccount => ({
	...account,
	loginCommand:
		account.harness === "claude"
			? `CLAUDE_CONFIG_DIR=${quote(account.profilePath)} claude auth login`
			: account.harness === "codex"
				? `CODEX_HOME=${quote(account.profilePath)} codex login`
				: account.harness === "pi"
					? `PI_CODING_AGENT_DIR=${quote(account.profilePath)} pi`
					: account.harness === "opencode"
						? `XDG_DATA_HOME=${quote(account.profilePath)} opencode auth login`
						: null,
	capabilities: {
		launch: true,
		resumeWithAccount: true,
		quota: ["claude", "codex"].includes(account.harness),
		detail: null,
	},
});
