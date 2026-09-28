import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeSession } from "@trellis/runtime-protocol";

// Terminal logs expire independently of process ownership. An exit receipt keeps
// an attempt closed after its logs disappear, so a delayed start cannot run it again.
export class ExitReceipts {
	private readonly directory: string;
	constructor(home: string) {
		this.directory = join(home, "exits");
	}
	read(id: string): RuntimeSession | undefined {
		const path = join(this.directory, `${id}.json`);
		if (!existsSync(path)) return;
		return JSON.parse(readFileSync(path, "utf8"));
	}
	write(session: RuntimeSession) {
		if (session.status !== "exited" || session.endedAt === null) return;
		mkdirSync(this.directory, { recursive: true, mode: 0o700 });
		const path = join(this.directory, `${session.id}.json`);
		writeFileSync(`${path}.tmp`, JSON.stringify(session), { mode: 0o600 });
		renameSync(`${path}.tmp`, path);
	}
}
