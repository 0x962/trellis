import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { PAGE_RENDER_IDLE_MS, PAGE_RENDER_MAX_MS, PAGE_RENDER_RENEW_MS, type PageRenderLease } from "@trellis/api";
import { type LeaseState, leaseRenewer } from "./leaseRenewer";

const fixture = () => {
	let now = 0;
	let visible = true;
	let timer: { callback: () => void; delay: number } | null = null;
	let count = 0;
	let renewError: Error | null = null;
	const calls: { page: string; version?: unknown }[] = [];
	const renewals: string[] = [];
	let state: LeaseState = { lease: null, error: null, refreshes: 0 };
	const make = (): PageRenderLease => ({
		id: String(++count),
		nonce: `nonce${count}`,
		frameUrl: `/frame/${count}`,
		contentRoot: `/frame/${count}/`,
		pageId: "page",
		version: 3,
		idleExpiresAt: new Date(now + PAGE_RENDER_IDLE_MS).toISOString(),
		absoluteExpiresAt: new Date(now + PAGE_RENDER_MAX_MS).toISOString(),
	});
	const controller = leaseRenewer({
		page: "TRL/pages/report",
		version: 3,
		now: () => now,
		visible: () => visible,
		setTimer: (callback, delay) => {
			timer = { callback, delay };
			return () => {
				timer = null;
			};
		},
		onChange: (next) => {
			state = next;
		},
		pages: {
			createRenderLease: async (input) => {
				calls.push(input);
				return make();
			},
			renewRenderLease: async ({ leaseId }) => {
				renewals.push(leaseId);
				if (renewError) throw renewError;
				return {
					...state.lease!,
					idleExpiresAt: new Date(
						Math.min(now + PAGE_RENDER_IDLE_MS, Date.parse(state.lease!.absoluteExpiresAt)),
					).toISOString(),
				};
			},
		},
	});
	return {
		controller,
		calls,
		renewals,
		state: () => state,
		timer: () => timer,
		advance: (ms: number) => {
			now += ms;
		},
		hide: () => {
			visible = false;
		},
		show: () => {
			visible = true;
		},
		fail: (error: Error | null) => {
			renewError = error;
		},
	};
};

describe("Page render lease lifecycle", () => {
	test("renews after twenty visible minutes without replacing the frame", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		expect(f.timer()?.delay).toBe(PAGE_RENDER_RENEW_MS);
		f.advance(PAGE_RENDER_RENEW_MS);
		await f.controller.ensureLease();
		expect(f.renewals).toEqual(["1"]);
		expect(f.calls).toHaveLength(1);
		expect(f.state().lease?.id).toBe("1");
	});
	test("does not create or renew while hidden", async () => {
		const f = fixture();
		f.hide();
		await f.controller.ensureLease();
		expect(f.calls).toHaveLength(0);
		f.show();
		await f.controller.ensureLease();
		f.hide();
		f.controller.visibilityChanged();
		expect(f.timer()).toBeNull();
		await f.controller.ensureLease();
		expect(f.renewals).toHaveLength(0);
	});
	test("replaces an expired hidden lease with the same historical version", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		f.hide();
		f.advance(PAGE_RENDER_IDLE_MS);
		f.show();
		await f.controller.ensureLease();
		expect(f.calls).toEqual([
			{ page: "TRL/pages/report", version: 3 },
			{ page: "TRL/pages/report", version: 3 },
		]);
		expect(f.state().refreshes).toBe(1);
		expect(f.state().lease?.id).toBe("2");
	});
	test("replaces a lease after the server loses it", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		f.fail(new ORPCError("RENDER_LEASE_EXPIRED"));
		await f.controller.ensureLease();
		expect(f.state().lease?.id).toBe("2");
		expect(f.state().refreshes).toBe(1);
	});
	test("reloads at the absolute limit even with regular renewal", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		for (let elapsed = PAGE_RENDER_RENEW_MS; elapsed < PAGE_RENDER_MAX_MS; elapsed += PAGE_RENDER_RENEW_MS) {
			f.advance(PAGE_RENDER_RENEW_MS);
			await f.controller.ensureLease();
		}
		expect(f.calls).toHaveLength(1);
		f.advance(PAGE_RENDER_RENEW_MS);
		await f.controller.ensureLease();
		expect(f.calls).toHaveLength(2);
		expect(f.state().refreshes).toBe(1);
	});
	test("keeps the loaded frame on a network error and waits for a new signal", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		const error = new TypeError("Failed to fetch");
		f.fail(error);
		await f.controller.ensureLease();
		expect(f.state().lease?.id).toBe("1");
		expect(f.state().error).toBe(error);
		expect(f.timer()).toBeNull();
		f.fail(null);
		await f.controller.ensureLease();
		expect(f.state().error).toBeNull();
		expect(f.calls).toHaveLength(1);
	});
	test("does not recover permission errors as an expired lease", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		f.fail(new ORPCError("FORBIDDEN"));
		await f.controller.ensureLease();
		expect(f.calls).toHaveLength(1);
		expect(f.state().error).toBeInstanceOf(ORPCError);
	});
	test("cancels the timer on unmount and ignores further checks", async () => {
		const f = fixture();
		await f.controller.ensureLease();
		f.controller.stop();
		await f.controller.ensureLease();
		expect(f.timer()).toBeNull();
		expect(f.renewals).toHaveLength(0);
	});
});
