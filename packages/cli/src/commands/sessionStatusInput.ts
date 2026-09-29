import type { SessionUpdatesWriteInput } from "@trellis/api";
import type { CliContext } from "../context.ts";
import { readText, splitList } from "../context.ts";
import { fileAt } from "../file.ts";

export const sessionStatusInput = async (
	ctx: CliContext,
	args: { session: string; body: string; requestId?: string; embed?: string },
	readFile: (path: string) => File = fileAt,
): Promise<SessionUpdatesWriteInput> => ({
	sessionId: args.session,
	requestId: args.requestId,
	body: await readText(ctx, args.body),
	embeds: await Promise.all(
		(splitList(args.embed) ?? []).map(async (path) => {
			const file = readFile(path);
			return { title: file.name, html: await file.text() };
		}),
	),
});
