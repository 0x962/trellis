import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SessionCreateInputSchema } from "@trellis/api";
import { attachmentPrompt, prepareFiles } from "./attachments.ts";

test("stores all 21 uploads under their run and preserves prompt order", async () => {
	const home = await mkdtemp(join(tmpdir(), "trellis-session-attachments-"));
	try {
		const input = SessionCreateInputSchema.parse({
			prompt: "Read each file",
			files: Array.from({ length: 21 }, (_, index) => new File([`Content ${index}`], `note-${index}.txt`)),
		});
		const files = await prepareFiles(input.files);
		const prompt = await attachmentPrompt(home, "selected-run", input.prompt, files);
		const paths = prompt
			.split("\n")
			.slice(3)
			.map((path) => JSON.parse(path) as string);
		expect(paths).toHaveLength(21);
		for (const [index, path] of paths.entries()) {
			expect(path).toBe(join(home, "agents", "selected-run", "attachments", files[index]!.sha, `note-${index}.txt`));
			expect(await readFile(path, "utf8")).toBe(`Content ${index}`);
			expect((await stat(dirname(path))).mode & 0o777).toBe(0o700);
		}
	} finally {
		await rm(home, { recursive: true });
	}
});

test("prepares complete valid files above the former configured limit", async () => {
	const body = "文🙂".repeat(400);
	const files = await prepareFiles([new File([body], "notes.txt", { type: "text/plain" })]);

	expect(files).toHaveLength(1);
	expect(files[0]!.bytes.toString()).toBe(body);
	expect(files[0]!.bytes.byteLength).toBeGreaterThan(1024);
});
