import type { ArgsDef } from "citty";
import { usageError } from "./errors.ts";

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

// The spellings a flag answers to: its name, its aliases, and the camelCase
// form citty accepts for a kebab-case name (`--dry-run`, `--dryRun`).
const spellingsOf = (name: string, alias: string | string[] | undefined): string[] => {
	const aliases = alias === undefined ? [] : Array.isArray(alias) ? alias : [alias];
	return [name, camel(name), ...aliases];
};

// Every value of a flag that the caller may repeat, in order. citty keeps
// only the last value of a repeated flag, so this reads the raw arguments.
// `--name value` and `--name=value` both count. Everything after `--` is
// positional.
export const repeatedFlag = (rawArgs: string[], name: string): string[] => {
	const spellings = new Set(spellingsOf(name, undefined).map((spelling) => `--${spelling}`));
	const values: string[] = [];
	for (let index = 0; index < rawArgs.length; index++) {
		const arg = rawArgs[index]!;
		if (arg === "--") break;
		const equals = arg.indexOf("=");
		if (equals !== -1 && spellings.has(arg.slice(0, equals))) values.push(arg.slice(equals + 1));
		else if (spellings.has(arg)) values.push(rawArgs[++index]!);
	}
	return values;
};

// Every label ref of a label flag, in order, or undefined when the flag is
// absent. The caller may repeat the flag, and one value may hold several refs
// with a comma between them, because a label name holds no comma.
export const labelRefs = (rawArgs: string[], name: string): string[] | undefined => {
	const refs = repeatedFlag(rawArgs, name)
		.flatMap((value) => value.split(","))
		.map((ref) => ref.trim())
		.filter((ref) => ref !== "");
	return refs.length === 0 ? undefined : refs;
};

// True when `--<name>` is on the command line. citty reads `--no-group` as
// the flag `group` set to false, and it sets no flag named `no-group`. So a
// command that declares the boolean `no-group` reads it here. Everything
// after `--` is positional.
export const hasFlag = (rawArgs: string[], name: string): boolean => {
	const end = rawArgs.indexOf("--");
	return (end === -1 ? rawArgs : rawArgs.slice(0, end)).includes(`--${name}`);
};

// Every spelling of every flag of the command that takes a value. citty
// reads the token after such a flag as its value, so the caller that splits
// the global flags skips that token: `comment --body --help` sends the text
// `--help` and prints no help.
export const valuedSpellings = (argsDef: ArgsDef): Set<string> => {
	const valued = new Set<string>();
	for (const [name, def] of Object.entries(argsDef)) {
		if (def.type === "positional" || def.type === "boolean") continue;
		for (const spelling of spellingsOf(name, "alias" in def ? def.alias : undefined)) valued.add(spelling);
	}
	return valued;
};

// Refuses a flag the command does not declare, and a flag that takes a value
// and has none. citty parses without strict mode: an unknown flag lands in
// the parsed args as a stray key, and its value becomes a positional.
// Without this check `list -p CDE` sends no project and lists every ticket,
// and `edit CDE-42 --description` sends an empty description that erases the
// text on the ticket. A string or enum flag without `=` takes the next token
// as its value, so a value that starts with a dash passes. `--no-<name>`
// negates a boolean. Everything after `--` is positional.
export const checkFlags = (rawArgs: string[], argsDef: ArgsDef, usage: string): void => {
	const booleans = new Set<string>();
	const valued = valuedSpellings(argsDef);
	for (const [name, def] of Object.entries(argsDef)) {
		if (def.type !== "boolean") continue;
		for (const spelling of spellingsOf(name, "alias" in def ? def.alias : undefined)) booleans.add(spelling);
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
		if (equals !== -1) continue;
		if (index + 1 === rawArgs.length) throw usageError(`${flag} needs a value; run ${usage} --help`);
		index++;
	}
};
