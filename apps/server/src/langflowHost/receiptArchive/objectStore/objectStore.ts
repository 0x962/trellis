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
		this.persist(this.path(id), bytes);
		return id;
	}

	bind(key: string, id: string) {
		this.read(id);
		this.persist(join(this.directory, `binding-${protocolDigest(key)}.json`), JSON.stringify({ key, id }));
	}

	readBinding(key: string): string {
		const record = JSON.parse(this.readPath(join(this.directory, `binding-${protocolDigest(key)}.json`)));
		if (record.key !== key || typeof record.id !== "string") throw new Error("receipt_binding_corrupt");
		this.read(record.id);
		return record.id;
	}

	private persist(destination: string, bytes: string) {
		if (existsSync(destination)) {
			if (this.readPath(destination) !== bytes) throw new Error("receipt_immutable_conflict");
			this.syncDirectory(this.directory);
			return;
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
			if (this.readPath(destination) !== bytes) throw new Error("receipt_immutable_conflict");
		} finally {
			unlinkSync(temporary);
		}
		this.syncDirectory(this.directory);
	}

	read(id: string) {
		const bytes = this.readPath(this.path(id));
		if (protocolDigest(bytes) !== id) throw new Error("receipt_digest_mismatch");
		return bytes;
	}

	private readPath(path: string) {
		const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			return readFileSync(fd, "utf8");
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
