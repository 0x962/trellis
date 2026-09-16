import type { HarnessAccount } from "@trellis/api";
import { profileDefault } from "./profiles.ts";
import type { AccountRow } from "./queries.ts";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

// The default Muse login signs in through its own homes. A managed Muse
// profile is one directory that serves as both XDG homes.
const museLoginCommand = (profilePath: string) =>
	profilePath === profileDefault("muse", process.env)
		? "muse login"
		: `XDG_CONFIG_HOME=${quote(profilePath)} XDG_DATA_HOME=${quote(profilePath)} muse login`;

// The shell command that signs the profile in. A person runs it in a
// terminal on this machine; the provider CLI owns the sign-in.
export const loginCommandFor = (harness: string, profilePath: string): string | null =>
	harness === "claude"
		? `CLAUDE_CONFIG_DIR=${quote(profilePath)} claude auth login`
		: harness === "codex"
			? `CODEX_HOME=${quote(profilePath)} codex login`
			: harness === "pi"
				? `PI_CODING_AGENT_DIR=${quote(profilePath)} pi`
				: harness === "opencode"
					? `XDG_DATA_HOME=${quote(profilePath)} opencode auth login`
					: harness === "muse"
						? museLoginCommand(profilePath)
						: null;

export const presentAccount = (account: AccountRow): HarnessAccount => ({
	...account,
	loginCommand: loginCommandFor(account.harness, account.profilePath),
	capabilities: {
		launch: true,
		resumeWithAccount: true,
		quota: ["claude", "codex"].includes(account.harness),
		detail: null,
	},
});
