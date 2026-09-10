import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

// The typed form of the TRELLIS_* variables. `home` is the data home. The
// derived paths sit under it: the database, the blobs, the upload temp
// files, the archives, and the rotating log.
export type Config = {
	home: string;
	// The address the server binds. 127.0.0.1 keeps it on this machine; a
	// network address or 0.0.0.0 lets a phone reach it, and the server has no
	// auth.
	host: string;
	port: number;
	maxUploadMb: number;
	ghBin: string;
	webDist: string;
	logLevel: LogLevel;
	dbInline: boolean;
	// How many times faster than the wall clock the poller and the
	// maintenance timer run. The server runs at 1; a test sets 100.
	clockRate: number;
	// The superset binary the agents runner spawns.
	supersetBin: string;
	// The trellis URL the agents talk to. It names this machine, because
	// the runner starts every agent on this machine.
	agentsUrl: string;
	dbDir: string;
	attachmentsDir: string;
	tmpDir: string;
	backupsDir: string;
	logFile: string;
};

export type Env = Record<string, string | undefined>;

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

// `<repo>/apps/web/dist`, which `bun run build` writes.
const defaultWebDist = join(import.meta.dir, "..", "..", "web", "dist");

const expandHome = (path: string) => (path.startsWith("~") ? join(homedir(), path.slice(1)) : path);

// A variable that is not a number is a typo in a shell profile, so the
// error names the variable and the value.
const numberOf = (name: string, value: string) => {
	const parsed = Number(value);
	if (value.trim() === "" || Number.isNaN(parsed)) throw new Error(`${name} must be a number, got "${value}".`);
	return parsed;
};

const levelOf = (value: string): LogLevel => {
	if (!LOG_LEVELS.includes(value as LogLevel)) {
		throw new Error(`TRELLIS_LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${value}".`);
	}
	return value as LogLevel;
};

// A server bound to every address answers on the loopback address too.
const agentsHost = (host: string) => (host === "0.0.0.0" ? "127.0.0.1" : host);

export const loadConfig = (env: Env): Config => {
	const home = resolve(expandHome(env.TRELLIS_HOME ?? "~/.trellis"));
	const host = env.TRELLIS_HOST ?? "127.0.0.1";
	const port = env.TRELLIS_PORT === undefined ? 4521 : numberOf("TRELLIS_PORT", env.TRELLIS_PORT);
	return {
		home,
		host,
		port,
		supersetBin: env.TRELLIS_SUPERSET_BIN ?? "superset",
		agentsUrl: `http://${agentsHost(host)}:${port}`,
		maxUploadMb:
			env.TRELLIS_MAX_UPLOAD_MB === undefined ? 50 : numberOf("TRELLIS_MAX_UPLOAD_MB", env.TRELLIS_MAX_UPLOAD_MB),
		ghBin: env.TRELLIS_GH_BIN ?? "gh",
		webDist: env.TRELLIS_WEB_DIST === undefined ? defaultWebDist : resolve(expandHome(env.TRELLIS_WEB_DIST)),
		logLevel: env.TRELLIS_LOG_LEVEL === undefined ? "info" : levelOf(env.TRELLIS_LOG_LEVEL),
		dbInline: env.TRELLIS_DB_INLINE === "true",
		clockRate: env.TRELLIS_CLOCK_RATE === undefined ? 1 : numberOf("TRELLIS_CLOCK_RATE", env.TRELLIS_CLOCK_RATE),
		dbDir: join(home, "db"),
		attachmentsDir: join(home, "attachments"),
		tmpDir: join(home, "attachments", "tmp"),
		backupsDir: join(home, "backups"),
		logFile: join(home, "server.log"),
	};
};
