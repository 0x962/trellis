import { describe, expect, test } from "bun:test";
import type { Fields, Logger } from "../../log.ts";
import { BrowserSessionStore } from "./browserSessions.ts";

const log = { info: () => {} } as unknown as Logger;

const redeem = (store: BrowserSessionStore, code: string) => {
	const result = store.redeemCode(code);
	if (result.kind !== "session") throw new Error(`Expected a session, got ${result.kind}.`);
	return result.session;
};

describe("browser sessions", () => {
	test("redeems one short-lived code once", () => {
		let now = 1_000;
		const store = new BrowserSessionStore({ hostId: "host-a", log, now: () => now, codeTtlMs: 100 });
		const issued = store.issueCode();
		expect(store.redeemCode(issued.code).kind).toBe("session");
		expect(store.redeemCode(issued.code)).toEqual({ kind: "invalid" });

		const expired = store.issueCode();
		now += 100;
		expect(store.redeemCode(expired.code)).toEqual({ kind: "invalid" });
	});

	test("removes a code after its failed attempt limit", () => {
		const store = new BrowserSessionStore({ hostId: "host-a", log, codeAttemptLimit: 3 });
		const issued = store.issueCode();
		const [id, secret] = issued.code.split(".") as [string, string];
		const wrongSecret = `${secret.startsWith("A") ? "B" : "A"}${secret.slice(1)}`;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			expect(store.redeemCode(`${id}.${wrongSecret}`)).toEqual({ kind: "invalid" });
		}
		expect(store.redeemCode(issued.code)).toEqual({ kind: "invalid" });
	});

	test("blocks guesses for a bounded window", () => {
		let now = 1_000;
		const store = new BrowserSessionStore({
			hostId: "host-a",
			log,
			now: () => now,
			guessLimit: 2,
			guessWindowMs: 100,
		});
		expect(store.redeemCode("unknown.first")).toEqual({ kind: "invalid" });
		expect(store.redeemCode("unknown.second")).toEqual({ kind: "invalid" });
		expect(store.redeemCode("unknown.third")).toEqual({ kind: "rate-limited", retryAt: 1_100 });
		now += 101;
		expect(store.redeemCode("unknown.fourth")).toEqual({ kind: "invalid" });
	});

	test("expires and revokes sessions", () => {
		let now = 1_000;
		const store = new BrowserSessionStore({ hostId: "host-a", log, now: () => now, sessionTtlMs: 100 });
		const first = redeem(store, store.issueCode().code);
		expect(store.authenticate(first.token)).toEqual({ id: first.id, expiresAt: 1_100 });
		store.revoke(first.id);
		expect(store.authenticate(first.token)).toBeNull();

		const second = redeem(store, store.issueCode().code);
		store.revokeToken(second.token);
		expect(store.authenticate(second.token)).toBeNull();

		const third = redeem(store, store.issueCode().code);
		now += 100;
		expect(store.authenticate(third.token)).toBeNull();
	});

	test("revokes every active session", () => {
		const store = new BrowserSessionStore({ hostId: "host-a", log });
		const first = redeem(store, store.issueCode().code);
		const second = redeem(store, store.issueCode().code);
		store.revokeAll();
		expect(store.authenticate(first.token)).toBeNull();
		expect(store.authenticate(second.token)).toBeNull();
	});

	test("notifies active connections about revocation and expiry", () => {
		let expire = () => {};
		const store = new BrowserSessionStore({
			hostId: "host-a",
			log,
			schedule: (action) => {
				expire = action;
				return () => {};
			},
		});
		const revoked = redeem(store, store.issueCode().code);
		const revokedReasons: string[] = [];
		store.onInvalidated(revoked.id, (reason) => revokedReasons.push(reason));
		store.revoke(revoked.id);
		expect(revokedReasons).toEqual(["revoked"]);

		const expired = redeem(store, store.issueCode().code);
		const expiredReasons: string[] = [];
		store.onInvalidated(expired.id, (reason) => expiredReasons.push(reason));
		expire();
		expect(expiredReasons).toEqual(["expired"]);
		expect(store.authenticate(expired.token)).toBeNull();
	});

	test("does not accept a session on another host", () => {
		const firstHost = new BrowserSessionStore({ hostId: "host-a", log });
		const otherHost = new BrowserSessionStore({ hostId: "host-b", log });
		const session = redeem(firstHost, firstHost.issueCode().code);
		expect(otherHost.authenticate(session.token)).toBeNull();
	});

	test("logs invalidation without the session token", () => {
		const records: Fields[] = [];
		const eventLog = {
			info: (_message: string, fields?: Fields) => records.push(fields ?? {}),
		} as unknown as Logger;
		const store = new BrowserSessionStore({ hostId: "host-a", log: eventLog });
		const session = redeem(store, store.issueCode().code);
		store.revoke(session.id);
		expect(records).toContainEqual({
			hostId: "host-a",
			reqId: null,
			sessionId: session.id,
			action: "session.invalidate",
			result: "revoked",
		});
		expect(JSON.stringify(records)).not.toContain(session.token);
	});
});
