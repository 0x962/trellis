import { describe, expect, test } from "bun:test";
import { BrowserSessionStore } from "./browserSessions.ts";

const redeem = (store: BrowserSessionStore, code: string) => {
	const result = store.redeemCode(code);
	if (result.kind !== "session") throw new Error(`Expected a session, got ${result.kind}.`);
	return result.session;
};

describe("browser sessions", () => {
	test("redeems one short-lived code once", () => {
		let now = 1_000;
		const store = new BrowserSessionStore({ hostId: "host-a", now: () => now, codeTtlMs: 100 });
		const issued = store.issueCode();
		expect(store.redeemCode(issued.code).kind).toBe("session");
		expect(store.redeemCode(issued.code)).toEqual({ kind: "invalid" });

		const expired = store.issueCode();
		now += 100;
		expect(store.redeemCode(expired.code)).toEqual({ kind: "invalid" });
	});

	test("removes a code after its failed attempt limit", () => {
		const store = new BrowserSessionStore({ hostId: "host-a", codeAttempts: 3 });
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
		const store = new BrowserSessionStore({ hostId: "host-a", now: () => now, sessionTtlMs: 100 });
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
		const store = new BrowserSessionStore({ hostId: "host-a" });
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
		const firstHost = new BrowserSessionStore({ hostId: "host-a" });
		const otherHost = new BrowserSessionStore({ hostId: "host-b" });
		const session = redeem(firstHost, firstHost.issueCode().code);
		expect(otherHost.authenticate(session.token)).toBeNull();
	});
});
