import type { GhReason } from "@trellis/api";
import { executionEnvironment } from "../executionEnvironment";

// TRELLIS_GH_BIN selects the executable. Otherwise, gh resolves through the
// PATH from executionEnvironment(). GH_PROMPT_DISABLED=1 and NO_COLOR=1
// keep each command suitable for a request without a terminal.
//
// One gh binary serves the whole process, so the slots are shared by every
// runner: 2 poller slots and 1 interactive slot. A poller call past its two
// slots waits for one to free. An interactive call (diff, refresh, link)
// never waits on a poller, so a user action is not stuck behind a tick.

export type GhSlot = "poller" | "interactive";

export type GhSuccess = { ok: true; code: number; stdout: string; stderr: string };

// `missing`: the binary is not on disk. `unauthenticated`: nobody is signed
// in, or GitHub rejected the stored token. `error`: any other non-zero exit,
// or the timeout.
export type GhFailure =
	| { ok: false; reason: Extract<GhReason, "missing" | "unauthenticated">; message: string }
	| { ok: false; reason: Extract<GhReason, "error">; message: string; code: number | null; stdout: string };

export type GhResult = GhSuccess | GhFailure;

export type GhRunner = ((slot: GhSlot, args: string[]) => Promise<GhResult>) & {
	bin: string;
	timeoutMs: number;
};

export const DEFAULT_TIMEOUT_MS = 30_000;

class Semaphore {
	private free: number;
	private readonly waiters: Array<() => void> = [];

	constructor(count: number) {
		this.free = count;
	}

	// Resolves with the release function once a slot is free. A released slot
	// passes straight to the oldest waiter, so waiters run in call order.
	async acquire(): Promise<() => void> {
		if (this.free > 0) this.free--;
		else await new Promise<void>((resolve) => this.waiters.push(resolve));
		return () => {
			const next = this.waiters.shift();
			if (next === undefined) this.free++;
			else next();
		};
	}
}

const slots: Record<GhSlot, Semaphore> = {
	poller: new Semaphore(2),
	interactive: new Semaphore(1),
};

const isMissing = (error: unknown) => (error as { code?: string }).code === "ENOENT";

// gh names `gh auth login` when no host is signed in. When a stored token is
// expired or revoked, gh instead prints the answer GitHub gave: HTTP 401 with
// the text "Bad credentials". Both mean the person must sign in again, so
// both give the unauthenticated reason and the same banner.
const SIGN_IN_NEEDED = /gh auth login|HTTP 401|Bad credentials/;

const spawnGh = async (bin: string, args: string[], timeoutMs: number, env: NodeJS.ProcessEnv): Promise<GhResult> => {
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([bin, ...args], {
			env: { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch (error) {
		if (isMissing(error))
			return {
				ok: false,
				reason: "missing",
				message: `trellis did not find the gh binary at ${bin}. Install gh, or set TRELLIS_GH_BIN.`,
			};
		throw error;
	}
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		proc.kill("SIGKILL");
	}, timeoutMs);
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout as ReadableStream).text(),
		new Response(proc.stderr as ReadableStream).text(),
		proc.exited,
	]);
	clearTimeout(timer);
	if (timedOut) {
		const message = `gh did not finish before the timeout of ${timeoutMs} ms: ${bin} ${args.join(" ")}`;
		return { ok: false, reason: "error", message, code: null, stdout };
	}
	if (code === 0) return { ok: true, code, stdout, stderr };
	const message = stderr.trim();
	if (SIGN_IN_NEEDED.test(message)) return { ok: false, reason: "unauthenticated", message };
	return { ok: false, reason: "error", message, code, stdout };
};

export const createGhRunner = (
	options: { timeoutMs?: number; environment?: () => Promise<NodeJS.ProcessEnv> } = {},
): GhRunner => {
	const configuredBin = process.env.TRELLIS_GH_BIN;
	const bin = configuredBin ?? "gh";
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const run = async (slot: GhSlot, args: string[]): Promise<GhResult> => {
		let env: NodeJS.ProcessEnv;
		try {
			env = await (options.environment ?? executionEnvironment)();
		} catch (error) {
			return { ok: false, reason: "error", message: (error as Error).message, code: null, stdout: "" };
		}
		const release = await slots[slot].acquire();
		try {
			return await spawnGh(configuredBin ?? env.TRELLIS_GH_BIN ?? "gh", args, timeoutMs, env);
		} finally {
			release();
		}
	};
	return Object.assign(run, { bin, timeoutMs });
};
