import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The name of the setting in a codex configuration file. Codex asks the person
// about a new version at the start of a terminal session, and this setting
// turns that question off.
const SETTING = "check_for_update_on_startup";

// The text of `config.toml` above its first table header. A table header holds
// a line that starts with `[`, and every line under it belongs to that table.
// A setting that codex reads at the top level counts only above the first one.
const aboveTheFirstTable = (text: string) => text.split(/^[ \t]*\[/m)[0]!;

// Codex reads every setting from `$CODEX_HOME/config.toml`. A Trellis launch
// points CODEX_HOME at the profile directory of the login it selects, so codex
// reads that profile and not `~/.codex/config.toml`, the file a person edits
// for the codex they start themselves. Codex asks about a new version when the
// file it reads states no value, so a Trellis session asks although the person
// turned the question off.
//
// This function reads the value from `~/.codex/config.toml` and returns it as
// a codex command line override. The codex terminal then asks about a new
// version exactly as often as a codex the person starts in a terminal. A file
// that states no value gives no override, and the profile decides.
export async function updateCheckOption(home: string): Promise<string[]> {
	const path = join(home, ".codex", "config.toml");
	// A person who never opened codex outside Trellis has no such file.
	const text = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return "";
		throw error;
	});
	const value = new RegExp(`^[ \t]*${SETTING}[ \t]*=[ \t]*(true|false)[ \t]*$`, "m").exec(aboveTheFirstTable(text));
	return value === null ? [] : ["-c", `${SETTING}=${value[1]}`];
}
