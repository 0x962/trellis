import { describe, expect, test } from "bun:test";
import { classifyClaudeCredential, parseClaudeCredential, pickFreshestClaudeCredential } from "./credentials.ts";

const credential = (token: string, expiresAt: number, refreshTokenExpiresAt?: number) => ({
	token,
	email: null,
	plan: null,
	expiresAt,
	refreshTokenExpiresAt,
});

describe("Claude credentials", () => {
	test("parses refresh-token expiry only with a refresh token", () => {
		expect(
			parseClaudeCredential({
				claudeAiOauth: {
					accessToken: "access",
					expiresAt: 100,
					refreshToken: "refresh",
					refreshTokenExpiresAt: 200,
					subscriptionType: "max",
				},
			}),
		).toEqual({
			token: "access",
			email: null,
			plan: "max",
			expiresAt: 100,
			refreshTokenExpiresAt: 200,
		});
		expect(
			parseClaudeCredential({
				claudeAiOauth: { accessToken: "access", expiresAt: 100, refreshTokenExpiresAt: 200 },
			}),
		).toEqual({
			token: "access",
			email: null,
			plan: null,
			expiresAt: 100,
			refreshTokenExpiresAt: undefined,
		});
	});

	test("classifies live, stale, and expired credentials", () => {
		expect(classifyClaudeCredential(credential("live", 200), 100)).toBe("live");
		expect(classifyClaudeCredential(credential("stale", 50, 200), 100)).toBe("stale");
		expect(classifyClaudeCredential(credential("expired", 50, 75), 100)).toBe("expired");
	});

	test("selects the freshest usable credential", () => {
		const expired = credential("expired", 50, 75);
		const stale = credential("stale", 50, 200);
		const liveOlder = credential("live-older", 150);
		const liveNewer = credential("live-newer", 250);
		expect(pickFreshestClaudeCredential([expired, stale, liveOlder, liveNewer], 100)?.token).toBe("live-newer");
	});
});
