import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Logger } from "../../log.ts";

export const BROWSER_SESSION_COOKIE = "__Host-trellis-session";
export const BROWSER_LOGIN_CODE_TTL_MS = 2 * 60 * 1000;
export const BROWSER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const BROWSER_LOGIN_CODE_ATTEMPT_LIMIT = 5;
export const BROWSER_LOGIN_GUESS_LIMIT = 20;
export const BROWSER_LOGIN_GUESS_WINDOW_MS = 60 * 1000;

type LoginCode = {
	id: string;
	secretHash: Buffer;
	expiresAt: number;
	failedAttempts: number;
};

export type BrowserSession = {
	id: string;
	expiresAt: number;
};

type StoredBrowserSession = BrowserSession & {
	tokenHash: Buffer;
	cancelExpiry: () => void;
};

export type BrowserSessionInvalidation = "expired" | "revoked";

export type IssuedBrowserLoginCode = {
	id: string;
	code: string;
	expiresAt: number;
};

export type RedeemedBrowserSession = BrowserSession & {
	token: string;
};

export type BrowserLoginResult =
	| { kind: "session"; session: RedeemedBrowserSession }
	| { kind: "invalid" }
	| { kind: "rate-limited"; retryAt: number };

export type BrowserSessionStoreOptions = {
	hostId: string;
	log: Logger;
	now?: () => number;
	random?: (size: number) => Buffer;
	schedule?: (action: () => void, delayMs: number) => () => void;
	codeTtlMs?: number;
	sessionTtlMs?: number;
	codeAttemptLimit?: number;
	guessLimit?: number;
	guessWindowMs?: number;
};

const CODE_ID_BYTES = 12;
const SECRET_BYTES = 32;
const LOGIN_CODE_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/;

const encode = (bytes: Buffer) => bytes.toString("base64url");

const hash = (hostId: string, value: string) =>
	createHash("sha256").update(hostId).update("\0").update(value).digest();

const equalHash = (left: Buffer, right: Buffer) => timingSafeEqual(left, right);

const schedule = (action: () => void, delayMs: number) => {
	const timeout = setTimeout(action, delayMs);
	timeout.unref();
	return () => clearTimeout(timeout);
};

export class BrowserSessionStore {
	readonly hostId: string;
	readonly codeTtlMs: number;
	readonly sessionTtlMs: number;
	readonly codeAttemptLimit: number;
	readonly guessLimit: number;
	readonly guessWindowMs: number;

	private readonly now: () => number;
	private readonly log: Logger;
	private readonly random: (size: number) => Buffer;
	private readonly schedule: (action: () => void, delayMs: number) => () => void;
	private readonly codes = new Map<string, LoginCode>();
	private readonly sessions = new Map<string, StoredBrowserSession>();
	private readonly invalidationListeners = new Map<
		string,
		Set<(reason: BrowserSessionInvalidation) => void>
	>();
	private failedGuesses: number[] = [];

	constructor(options: BrowserSessionStoreOptions) {
		this.hostId = options.hostId;
		this.log = options.log;
		this.now = options.now ?? Date.now;
		this.random = options.random ?? ((size) => randomBytes(size));
		this.schedule = options.schedule ?? schedule;
		this.codeTtlMs = options.codeTtlMs ?? BROWSER_LOGIN_CODE_TTL_MS;
		this.sessionTtlMs = options.sessionTtlMs ?? BROWSER_SESSION_TTL_MS;
		this.codeAttemptLimit = options.codeAttemptLimit ?? BROWSER_LOGIN_CODE_ATTEMPT_LIMIT;
		this.guessLimit = options.guessLimit ?? BROWSER_LOGIN_GUESS_LIMIT;
		this.guessWindowMs = options.guessWindowMs ?? BROWSER_LOGIN_GUESS_WINDOW_MS;
	}

	issueCode(): IssuedBrowserLoginCode {
		const now = this.now();
		this.prune(now);
		const id = encode(this.random(CODE_ID_BYTES));
		const secret = encode(this.random(SECRET_BYTES));
		const expiresAt = now + this.codeTtlMs;
		this.codes.set(id, { id, secretHash: hash(this.hostId, secret), expiresAt, failedAttempts: 0 });
		return { id, code: `${id}.${secret}`, expiresAt };
	}

	redeemCode(code: string): BrowserLoginResult {
		const now = this.now();
		this.prune(now);
		if (this.failedGuesses.length >= this.guessLimit) {
			return { kind: "rate-limited", retryAt: this.failedGuesses[0]! + this.guessWindowMs };
		}
		const [id, secret, extra] = LOGIN_CODE_PATTERN.test(code) ? code.split(".") : [];
		const record = extra === undefined && id !== undefined ? this.codes.get(id) : undefined;
		if (record === undefined || secret === undefined || !equalHash(record.secretHash, hash(this.hostId, secret))) {
			this.failedGuesses.push(now);
			if (record !== undefined) {
				record.failedAttempts += 1;
				if (record.failedAttempts >= this.codeAttemptLimit) this.codes.delete(record.id);
			}
			return { kind: "invalid" };
		}
		this.codes.delete(record.id);
		const token = encode(this.random(SECRET_BYTES));
		const session = { id: encode(this.random(CODE_ID_BYTES)), expiresAt: now + this.sessionTtlMs, token };
		this.sessions.set(session.id, {
			id: session.id,
			expiresAt: session.expiresAt,
			tokenHash: hash(this.hostId, token),
			cancelExpiry: this.schedule(() => this.invalidate(session.id, "expired"), this.sessionTtlMs),
		});
		return { kind: "session", session };
	}

	authenticate(token: string): BrowserSession | null {
		const now = this.now();
		this.prune(now);
		const tokenHash = hash(this.hostId, token);
		for (const session of this.sessions.values()) {
			if (equalHash(session.tokenHash, tokenHash)) return { id: session.id, expiresAt: session.expiresAt };
		}
		return null;
	}

	revoke(id: string): boolean {
		return this.invalidate(id, "revoked");
	}

	revokeToken(token: string): void {
		const tokenHash = hash(this.hostId, token);
		for (const session of this.sessions.values()) {
			if (equalHash(session.tokenHash, tokenHash)) {
				this.invalidate(session.id, "revoked");
				return;
			}
		}
	}

	revokeAll(): void {
		for (const session of [...this.sessions.values()]) this.invalidate(session.id, "revoked");
	}

	onInvalidated(id: string, listener: (reason: BrowserSessionInvalidation) => void): () => void {
		if (!this.sessions.has(id)) {
			listener("revoked");
			return () => {};
		}
		const listeners = this.invalidationListeners.get(id) ?? new Set();
		listeners.add(listener);
		this.invalidationListeners.set(id, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.invalidationListeners.delete(id);
		};
	}

	private prune(now: number): void {
		for (const code of this.codes.values()) {
			if (code.expiresAt <= now) this.codes.delete(code.id);
		}
		for (const session of this.sessions.values()) {
			if (session.expiresAt <= now) this.invalidate(session.id, "expired");
		}
		this.failedGuesses = this.failedGuesses.filter((at) => at > now - this.guessWindowMs);
	}

	private invalidate(id: string, reason: BrowserSessionInvalidation): boolean {
		const session = this.sessions.get(id);
		if (session === undefined) return false;
		session.cancelExpiry();
		this.sessions.delete(id);
		const listeners = this.invalidationListeners.get(id);
		this.invalidationListeners.delete(id);
		this.log.info("browser session security", {
			hostId: this.hostId,
			reqId: null,
			sessionId: id,
			action: "session.invalidate",
			result: reason,
		});
		for (const listener of listeners ?? []) listener(reason);
		return true;
	}
}
