import { constants } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { type HostControlIdentity, LangflowHostControl } from "../../../langflowHost";
import { SnapshotCompatibilitySchema } from "../manifest/manifest";
import { syncDirectory } from "../syncDirectory";

export const PairedRequestSchema = z.strictObject({
	version: z.literal(1),
	kind: z.enum(["capture", "restore"]),
	snapshotId: z.uuid(),
	requestId: z.string().min(1),
	directory: z.string().min(1),
	dataHomeId: z.uuid(),
	hostId: z.uuid(),
	compatibility: SnapshotCompatibilitySchema,
	createdAt: z.iso.datetime(),
});
export type PairedRequest = z.infer<typeof PairedRequestSchema>;
export const pairedStages = [
	"request",
	"block",
	"grant",
	"active",
	"exporting",
	"engine",
	"trellis",
	"sealed",
	"revoking",
	"revoked",
	"restored",
	"reconciled",
] as const;
type Stage = (typeof pairedStages)[number];
type JournalControl = { identity: HostControlIdentity };

export class PairedJournal {
	private constructor(readonly directory: string) {}

	static async create(control: JournalControl, request: PairedRequest) {
		const value = PairedRequestSchema.parse(request);
		if (value.dataHomeId !== control.identity.dataHomeId || value.hostId !== control.identity.hostId)
			throw new Error("paired_journal_home_mismatch");
		const parent = join(LangflowHostControl.directory(control.identity.home), "paired-snapshots");
		await mkdir(parent, { recursive: true, mode: 0o700 });
		await syncDirectory(dirname(parent));
		const stat = await lstat(parent);
		if (
			!stat.isDirectory() ||
			stat.isSymbolicLink() ||
			(stat.mode & 0o777) !== 0o700 ||
			stat.uid !== process.getuid?.()
		)
			throw new Error("paired_journal_directory_unsafe");
		const directory = join(parent, value.snapshotId);
		await mkdir(directory, { mode: 0o700 });
		await syncDirectory(parent);
		const journal = new PairedJournal(directory);
		await journal.write("request", value);
		return journal;
	}

	static async open(control: JournalControl, snapshotId: string) {
		const id = z.uuid().parse(snapshotId);
		const directory = join(LangflowHostControl.directory(control.identity.home), "paired-snapshots", id);
		if ((await realpath(directory)) !== directory) throw new Error("paired_journal_directory_unsafe");
		const stat = await lstat(directory);
		if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.())
			throw new Error("paired_journal_directory_unsafe");
		const journal = new PairedJournal(directory);
		const request = PairedRequestSchema.parse(await journal.read("request"));
		if (request.dataHomeId !== control.identity.dataHomeId || request.hostId !== control.identity.hostId)
			throw new Error("paired_journal_home_mismatch");
		return journal;
	}

	async write(stage: Stage, value: unknown) {
		const prior = await this.read(stage);
		if (prior !== null) {
			if (!isDeepStrictEqual(prior, value)) throw new Error("paired_journal_stage_conflict");
			return;
		}
		const file = await open(join(this.directory, `${stage}.json`), "wx", 0o600);
		try {
			await file.writeFile(JSON.stringify(value));
			await file.sync();
		} finally {
			await file.close();
		}
		await syncDirectory(this.directory);
	}

	async read(stage: Stage): Promise<unknown | null> {
		const file = await open(join(this.directory, `${stage}.json`), constants.O_RDONLY | constants.O_NOFOLLOW).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return null;
				throw error;
			},
		);
		if (!file) return null;
		try {
			const stat = await file.stat();
			if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.())
				throw new Error("paired_journal_file_unsafe");
			return JSON.parse(await file.readFile("utf8"));
		} finally {
			await file.close();
		}
	}
}
