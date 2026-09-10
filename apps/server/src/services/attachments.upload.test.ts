import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { TrellisEvent } from "@trellis/api";
import { sql } from "drizzle-orm";
import { claude, hoursAgo, seedProject, seedTicket } from "../../test/fixtures";
import { eventSink, testCtx, withEmit } from "../../test/helpers/ctx.ts";
import { freshDb, type TestDb } from "../../test/helpers/db.ts";
import { freshHomeWithDirs, sha256Of } from "../../test/helpers/home.ts";
import { assertStatusInvariant } from "../../test/invariants.ts";
import { withTx } from "../db/tx.ts";
import { upload } from "./attachments.ts";

// An upload hashes the file while it writes `attachments/tmp`, finalizes the
// blob under the blob lock, and writes one attachment row. The row, the
// event, the activity row, and the ticket bump all belong to one commit.

let h: TestDb;
let home: string;
beforeAll(async () => {
	h = await freshDb();
});
beforeEach(async () => {
	await h.reset();
	home = freshHomeWithDirs();
});
afterEach(() => h.db.transaction(assertStatusInvariant));
afterAll(() => h.close());

const rows = async (table: string) =>
	(await h.db.execute(sql`SELECT * FROM ${sql.identifier(table)}`)).rows as Record<string, unknown>[];

const seedOneTicket = async () => {
	const { rootId, statuses } = await seedProject(h.db);
	const ticket = await seedTicket(h.db, {
		projectId: rootId,
		rootId,
		statusId: statuses.todo,
		number: 1,
		updatedAt: hoursAgo(5),
	});
	return { rootId, ticket };
};

type UploadInput = { ticket: string; file: File; name?: string };

const png = (text: string) => new File([new TextEncoder().encode(text)], "shot.png", { type: "image/png" });

const runUpload = async (input: UploadInput, actor?: { name: string; kind: "human" | "agent" | "system" }) => {
	const handle = testCtx({ db: h.db, home, actor });
	const { delivered, sink } = eventSink();
	let insideCommit = -1;
	const { result } = await withTx(
		h.db,
		async (tx, emit) => {
			const uploaded = await upload(withEmit(handle.ctx, emit), tx, input);
			insideCommit = delivered.length;
			return uploaded;
		},
		sink,
	);
	return { result, delivered, insideCommit, handle };
};

// The bytes a hasher reads, in call order. A stream chunk can be any size, so
// the service cuts every chunk to 1 MB before it hashes and writes it.
const recordHashChunks = async (run: () => Promise<unknown>) => {
	const proto = Bun.CryptoHasher.prototype as unknown as {
		update: (chunk: unknown, encoding?: string) => unknown;
	};
	const original = proto.update;
	const sizes: number[] = [];
	proto.update = function patched(this: unknown, chunk: unknown, encoding?: string) {
		sizes.push((chunk as { byteLength?: number }).byteLength ?? String(chunk).length);
		return original.call(this, chunk, encoding);
	};
	try {
		await run();
	} finally {
		proto.update = original;
	}
	return sizes;
};

// A File whose stream gives the whole file in one chunk, which is what a
// large multipart part can do.
class OneChunkFile extends File {
	constructor(
		private readonly whole: Uint8Array,
		name: string,
		type: string,
	) {
		super([whole], name, { type });
	}
	override stream(): ReadableStream<Uint8Array> {
		const whole = this.whole;
		return new ReadableStream({
			start(controller) {
				controller.enqueue(whole);
				controller.close();
			},
		});
	}
}

describe("attachments.upload", () => {
	test("the upload hashes the stream in chunks of 1 MB or less", async () => {
		const { ticket } = await seedOneTicket();
		const bytes = new Uint8Array(3 * 1024 * 1024).fill(7);
		const file = new OneChunkFile(bytes, "big.bin", "application/octet-stream");

		const sizes = await recordHashChunks(() => runUpload({ ticket: "CDE-1", file }));

		expect(sizes.length).toBeGreaterThanOrEqual(3);
		expect(Math.max(...sizes)).toBeLessThanOrEqual(1024 * 1024);
		expect(sizes.reduce((total, size) => total + size, 0)).toBe(bytes.length);
		const [row] = await rows("attachments");
		expect(row!.sha256).toBe(sha256Of(bytes));
		expect(row!.ticket_id).toBe(ticket);
	});

	test("an upload writes the row and returns the file url", async () => {
		const { ticket } = await seedOneTicket();
		const bytes = new TextEncoder().encode("a screenshot");
		const { result } = await runUpload({ ticket: "CDE-1", file: png("a screenshot") }, claude);

		const [row] = await rows("attachments");
		expect(row).toMatchObject({
			ticket_id: ticket,
			filename: "shot.png",
			mime: "image/png",
			size: bytes.length,
			sha256: sha256Of(bytes),
			actor_name: "claude",
			actor_kind: "agent",
		});
		expect(result.attachment).toMatchObject({
			id: row!.id as string,
			ticketId: ticket,
			filename: "shot.png",
			actor: { name: "claude", kind: "agent" },
		});
		expect(result.url).toBe(`/api/attachments/${row!.id}/file`);
		expect(result.attachment.url).toBe(result.url);
	});

	test("an image gets image markdown and any other file gets link markdown", async () => {
		await seedOneTicket();
		const image = await runUpload({ ticket: "CDE-1", file: png("pixels") });
		expect(image.result.markdown).toBe(`![shot.png](${image.result.url})`);

		const notes = new File([new TextEncoder().encode("plain words")], "notes.txt", { type: "text/plain" });
		const text = await runUpload({ ticket: "CDE-1", file: notes });
		expect(text.result.markdown).toBe(`[notes.txt](${text.result.url})`);
	});

	test("the name input replaces the file name", async () => {
		await seedOneTicket();
		const { result } = await runUpload({ ticket: "CDE-1", file: png("pixels"), name: "board.png" });

		const [row] = await rows("attachments");
		expect(row!.filename).toBe("board.png");
		expect(result.attachment.filename).toBe("board.png");
		expect(result.markdown).toBe(`![board.png](${result.url})`);
	});

	test("an upload moves the ticket version and updated_at", async () => {
		await seedOneTicket();
		const [before] = await rows("tickets");

		await runUpload({ ticket: "CDE-1", file: png("pixels") });

		const [after] = await rows("tickets");
		expect(after!.version).toBe(2);
		expect(before!.version).toBe(1);
		expect(new Date(after!.updated_at as string).getTime()).toBeGreaterThan(
			new Date(before!.updated_at as string).getTime(),
		);
	});

	test("an upload emits attachment.created after the commit", async () => {
		const { ticket } = await seedOneTicket();

		const { result, delivered, insideCommit } = await runUpload({ ticket: "CDE-1", file: png("pixels") });

		expect(insideCommit).toBe(0);
		const expected: TrellisEvent[] = [{ type: "attachment.created", id: result.attachment.id, ticketId: ticket }];
		expect(delivered.filter((event) => event.type === "attachment.created")).toEqual(expected);
	});

	test("an upload writes one activity row that names the file", async () => {
		const { rootId, ticket } = await seedOneTicket();

		await runUpload({ ticket: "CDE-1", file: png("pixels"), name: "board.png" }, { name: "builder", kind: "agent" });

		const activity = await rows("activity");
		expect(activity).toHaveLength(1);
		expect(activity[0]).toMatchObject({
			root_id: rootId,
			project_id: rootId,
			ticket_id: ticket,
			actor_name: "builder",
			actor_kind: "agent",
			action: "attachment.created",
		});
		expect(activity[0]!.meta).toMatchObject({ filename: "board.png" });
	});
});
