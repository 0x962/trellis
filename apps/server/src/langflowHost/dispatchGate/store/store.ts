import {
	closeSync,
	constants,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { lockHome } from "../../../homeLock";
import type { BlockReason, DispatchState } from "../contracts";
import { dispatchChanges } from "./notifications";
import { DispatchStateSchema } from "./schema";

export class DispatchStore {
	readonly directory: string;
	readonly path: string;

	constructor(
		directory: string,
		readonly dataHomeId: string,
	) {
		const stat = lstatSync(directory);
		if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) {
			throw new Error("dispatch_directory_unsafe");
		}
		this.directory = realpathSync(directory);
		this.path = join(this.directory, "dispatch.json");
	}

	static create(directory: string, dataHomeId: string, initialBlock?: { requestId: string; reason: BlockReason }) {
		mkdirSync(directory, { mode: 0o700 });
		const store = new DispatchStore(directory, dataHomeId);
		const block = initialBlock ? { ...initialBlock, id: crypto.randomUUID(), dataHomeId, generation: 1 } : null;
		store.write({
			version: 1,
			dataHomeId,
			generation: block ? 1 : 0,
			block,
			permits: [],
			reconciliations: [],
			captureGrants: [],
		});
		store.syncDirectory(dirname(store.directory));
		return store;
	}

	read(): DispatchState {
		const fd = openSync(this.path, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const value = DispatchStateSchema.parse(JSON.parse(readFileSync(fd, "utf8")));
			if (value.dataHomeId !== this.dataHomeId) throw new Error("dispatch_home_mismatch");
			return value;
		} finally {
			closeSync(fd);
		}
	}

	mutate<T>(operation: (state: DispatchState) => T): T {
		const lock = lockHome(this.directory, "server", null);
		try {
			const state = this.read();
			const result = operation(state);
			this.write(state);
			return result;
		} finally {
			lock.release();
		}
	}

	private write(state: DispatchState) {
		const bytes = JSON.stringify(DispatchStateSchema.parse(state));
		const temporary = join(this.directory, `${crypto.randomUUID()}.next`);
		const fd = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(fd, bytes);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temporary, this.path);
		this.syncDirectory(this.directory);
		dispatchChanges.emit(this.directory);
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
