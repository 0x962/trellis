import type { ArgsDef, CommandDef } from "citty";
import { verbs } from "../verbs.ts";

export const alias =
	(verb: string, path: string[] = [], args?: ArgsDef) =>
	async (): Promise<CommandDef> => {
		let command = await verbs[verb]!.load();
		for (const name of path) {
			const children = await (typeof command.subCommands === "function" ? command.subCommands() : command.subCommands);
			const child = children![name]!;
			command = await (typeof child === "function" ? child() : child);
		}
		const meta = await (typeof command.meta === "function" ? command.meta() : command.meta);
		return { ...command, meta: { ...meta, name: path.at(-1) ?? verb }, ...(args === undefined ? {} : { args }) };
	};
