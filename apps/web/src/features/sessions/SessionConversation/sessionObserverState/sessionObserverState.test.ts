import { expect, test } from "bun:test";
import { sessionObserverEnabled, sessionObserverInput, sessionObserverPollInterval } from "./sessionObserverState";

test("uses the selected run for ticket and standalone observers", () => {
	expect(sessionObserverInput({ id: "ticket-run" })).toEqual({ sessionId: "ticket-run" });
	expect(sessionObserverInput({ id: "standalone-run" })).toEqual({ sessionId: "standalone-run" });
});

test("keeps the observer off until the server enables the selected run", () => {
	expect(sessionObserverEnabled(undefined)).toBe(false);
	expect(sessionObserverEnabled({ enabled: false })).toBe(false);
	expect(sessionObserverEnabled({ enabled: true })).toBe(true);
	expect(sessionObserverPollInterval(undefined)).toBe(false);
	expect(sessionObserverPollInterval({ enabled: false })).toBe(false);
	expect(sessionObserverPollInterval({ enabled: true })).toBe(2000);
});
