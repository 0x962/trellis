import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fail, type ServiceCtx } from "../support.ts";

export async function prepareFiles(ctx: Pick<ServiceCtx, "maxUploadBytes">, files: File[] = []) {
	if (files.reduce((size, file) => size + file.size, 0) > ctx.maxUploadBytes)
		throw fail("PAYLOAD_TOO_LARGE", { maxBytes: ctx.maxUploadBytes });
	return Promise.all(
		files.map(async (file) => {
			const bytes = Buffer.from(await file.arrayBuffer());
			return { name: file.name, bytes, sha: createHash("sha256").update(bytes).digest("hex") };
		}),
	);
}

export async function attachmentPrompt(
	home: string,
	runId: string,
	text: string,
	files: Awaited<ReturnType<typeof prepareFiles>>,
) {
	if (files.length === 0) return text;
	const paths: string[] = [];
	for (const file of files) {
		const directory = join(home, "agents", runId, "attachments", file.sha);
		await mkdir(directory, { recursive: true, mode: 0o700 });
		const name = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_") || "attachment";
		const path = join(directory, name);
		await Bun.write(path, file.bytes, { mode: 0o600 });
		paths.push(JSON.stringify(path));
	}
	return `${text}\n\nAttached files on this computer:\n${paths.join("\n")}`;
}
