import { z } from "zod";
import { cleanupNativeExecutable } from "./cleanup/cleanup.ts";

const InputSchema = z.strictObject({
	root: z.string().startsWith("/"),
	runtimeSocket: z.string().startsWith("/"),
	attemptDirectory: z.string().startsWith("/"),
	attemptIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)),
	requestTimeoutMs: z.number().int().positive(),
});
await cleanupNativeExecutable(InputSchema.parse(await Bun.file(process.argv[2]!).json()));
