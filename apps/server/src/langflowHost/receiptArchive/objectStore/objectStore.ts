import {
	closeSync,
	constants,
	existsSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { protocolDigest } from "../../../langflowContracts";

export class ReceiptObjectStore {
	constructor(private readonly directory: string) {
		mkdirSync(directory, { mode: 0o700, recursive: true });
		const stat = lstatSync(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700)
			throw new Error("receipt_directory_unsafe");
		for (const path of [directory, dirname(directory)]) this.syncDirectory(path);
	}

	write(bytes: string) {
		const id = protocolDigest(bytes);
		const destination = this.path(id);
		if (existsSync(destination)) {
			this.read(id);
			this.syncDirectory(this.directory);
			return id;
		}
		const temporary = join(this.directory, `${crypto.randomUUID()}.next`);
		const fd = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(fd, bytes);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		try {
			linkSync(temporary, destination);
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
			this.read(id);
		} finally {
			unlinkSync(temporary);
		}
		this.syncDirectory(this.directory);
		return id;
	}

	read(id: string) {
		const fd = openSync(this.path(id), constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const bytes = readFileSync(fd, "utf8");
			if (protocolDigest(bytes) !== id) throw new Error("receipt_digest_mismatch");
			return bytes;
		} finally {
			closeSync(fd);
		}
	}

	private path(id: string) {
		if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("receipt_id_invalid");
		return join(this.directory, `${id}.json`);
	}

	private syncDirectory(path: string) {
		const fd = openSync(path, "r");
		try {
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
	}
}
