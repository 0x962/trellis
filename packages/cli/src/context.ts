import type { CommandContext } from "citty";
import type { ActorResolution } from "./actor.ts";
import type { Deps } from "./index.ts";
import type { Format, Writer } from "./output.ts";

// What every verb receives through citty's `data`. `actor()` resolves the
// actor on the first call and returns the same value after that, so one run
// resolves once and prints the git hint once.
export type CliContext = {
	deps: Deps;
	format: Format;
	// The format flags as passed. A pipe turns `format.mode` into json, but a
	// verb whose output is text (a brief, a diff) keeps the text unless one
	// of these is true.
	flags: { json: boolean; jsonl: boolean; quiet: boolean };
	url: string;
	desktopToken?: string;
	// The origin `trellis open` prints. It is `url` until TRELLIS_PUBLIC_URL
	// names another one, which a gateway or a proxy in front of the server
	// needs.
	publicUrl: string;
	actor: () => ActorResolution;
	out: Writer;
	err: Writer;
};

export const contextOf = (context: Pick<CommandContext, "data">): CliContext => context.data as CliContext;

export const wantsJson = (ctx: CliContext): boolean => ctx.flags.json || ctx.flags.jsonl;

// A text flag takes `-` for the whole standard input.
export const readText = (ctx: CliContext, value: string): Promise<string> =>
	value === "-" ? ctx.deps.stdin() : Promise.resolve(value);

type Compact<T> = { [K in keyof T]: Exclude<T[K], undefined> };

// Drops the keys whose value is undefined, so an absent flag sends no key.
export const compact = <T extends object>(object: T): Compact<T> =>
	Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as Compact<T>;

export const splitList = (value: string | undefined): string[] | undefined => value?.split(",");

export const toNumber = (value: string | undefined): number | undefined =>
	value === undefined ? undefined : Number(value);

// `none` on a parent flag clears the parent, which the contract spells as null.
export const noneToNull = (value: string | undefined): string | null | undefined => (value === "none" ? null : value);
