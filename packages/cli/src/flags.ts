import type { ArgsDef } from "citty";
import { usageError } from "./errors.ts";

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

// The spellings a flag answers to: its name, its aliases, and the camelCase
// form citty accepts for a kebab-case name (`--wip-limit`, `--wipLimit`).
const spellingsOf = (name: string, alias: string | string[] | undefined): string[] => {
	const aliases = alias === undefined ? [] : Array.isArray(alias) ? alias : [alias];
	return [name, camel(name), ...aliases];
};

// Refuses a flag the command does not declare. citty parses without strict
// mode: an unknown flag lands in the parsed args as a stray key, and its
// value becomes a positional. Without this check `list -p CDE` sends no
// project and lists every ticket. A string or enum flag without `=` takes
// the next token as its value, so a value that starts with a dash passes.
// `--no-<name>` negates a boolean. Everything after `--` is positional.
export const checkFlags = (rawArgs: string[], argsDef: ArgsDef, usage: string): void => {
	const booleans = new Set<string>();
	const valued = new Set<string>();
	for (const [name, def] of Object.entries(argsDef)) {
		if (def.type === "positional") continue;
		const target = def.type === "boolean" ? booleans : valued;
		for (const spelling of spellingsOf(name, "alias" in def ? def.alias : undefined)) target.add(spelling);
	}
	for (let index = 0; index < rawArgs.length; index++) {
		const arg = rawArgs[index]!;
		if (arg === "--") return;
		if (!arg.startsWith("-") || arg === "-") continue;
		const equals = arg.indexOf("=");
		const flag = equals === -1 ? arg : arg.slice(0, equals);
		const name = flag.replace(/^--?/, "");
		if (flag.startsWith("--no-") && booleans.has(name.slice(3))) continue;
		if (booleans.has(name)) continue;
		if (!valued.has(name)) throw usageError(`unknown flag ${flag}; run ${usage} --help`);
		if (equals === -1) index++;
	}
};
