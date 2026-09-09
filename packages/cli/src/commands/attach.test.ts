import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lines, runCli } from "../../test/deps.ts";
import { attachment, attachmentId } from "../../test/fixtures.ts";

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);

const tempFile = () => {
	const dir = mkdtempSync(join(tmpdir(), "trellis-attach-"));
	const path = join(dir, "shot.png");
	writeFileSync(path, bytes);
	return path;
};

const upload = () => ({
	attachment: attachment(),
	url: attachment().url,
	markdown: `![cover.png](${attachment().url})`,
});

type UploadInput = { ticket: string; file: File; name?: string };

describe("attach", () => {
	// CLI-97
	test("attach uploads the file as multipart", async () => {
		const path = tempFile();
		const named = await runCli(["attach", "CDE-42", path, "--name", "cover.png"], { "attachments.upload": upload() });
		expect(named.code).toBe(0);
		const call = named.calls[0]!;
		expect(call.path).toBe("attachments.upload");
		expect(call.request.headers.get("content-type")).toStartWith("multipart/form-data");
		const input = call.input as UploadInput;
		expect(input.ticket).toBe("CDE-42");
		expect(input.name).toBe("cover.png");
		expect(input.file).toBeInstanceOf(File);
		expect(new Uint8Array(await input.file.arrayBuffer())).toEqual(bytes);

		const unnamed = await runCli(["attach", "CDE-42", path], { "attachments.upload": upload() });
		const plain = unnamed.calls[0]!.input as UploadInput;
		expect(plain.file.name).toBe("shot.png");
		expect(plain).not.toHaveProperty("name");
	});

	// CLI-98
	test("attach prints the url and markdown", async () => {
		const path = tempFile();
		const tty = await runCli(
			["attach", "CDE-42", path, "--name", "cover.png"],
			{ "attachments.upload": upload() },
			{
				tty: true,
			},
		);
		expect(lines(tty.stdout)[0]).toMatch(
			/^Attached cover\.png \(\d+(\.\d+)? KB\) -> \/api\/attachments\/[0-9A-Z]{26}\/file$/,
		);

		const json = await runCli(["attach", "CDE-42", path, "--json"], { "attachments.upload": upload() });
		expect(JSON.parse(json.stdout)).toEqual(upload());

		const quiet = await runCli(["attach", "CDE-42", path, "--quiet"], { "attachments.upload": upload() });
		expect(quiet.stdout).toBe(`${attachmentId}\n`);
	});
});

describe("attachments", () => {
	// CLI-99
	test("attachments lists a ticket's files", async () => {
		const result = await runCli(["attachments", "CDE-42"], { "attachments.list": [attachment()] }, { tty: true });
		expect(result.code).toBe(0);
		expect(result.calls[0]).toMatchObject({ path: "attachments.list", input: { ticket: "CDE-42" } });
		const [header, ...rows] = lines(result.stdout);
		expect(
			header!
				.trim()
				.split(/\s{2,}/)
				.map((name) => name.toLowerCase()),
		).toEqual(["id", "filename", "size", "url"]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toStartWith(attachmentId);
		expect(rows[0]).toContain("cover.png");
		expect(rows[0]).toContain(attachment().url);
	});
});
