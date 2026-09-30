import { afterAll, expect, spyOn, test } from "bun:test";
import type { SessionUpdates } from "@trellis/api";
import { createResizeBrowser } from "./components/resizeBrowser";

const browser = createResizeBrowser();
const { act } = await import("react");
const { resizeFixture } = await import("./components/resizeFixture");
afterAll(() => browser.close());

const empty: SessionUpdates = { latest: null, previous: null, request: null, history: [], nextCursor: null };
const latest = {
	id: "update-a",
	runId: "session-a",
	sessionId: null,
	requestId: null,
	body: "Latest update",
	embeds: [],
	createdAt: "2026-09-29T05:58:00.000Z",
};
const previous = { ...latest, id: "update-b", body: "Previous update", createdAt: "2026-09-29T05:50:00.000Z" };
const populated: SessionUpdates = { latest, previous, history: [latest, previous], request: null, nextCursor: null };

test("captures a drag outside the handle and saves only the completed width", async () => {
	const f = await resizeFixture(browser);
	try {
		expect(f.width()).toBe(374);
		const handle = f.handle();
		expect(handle.getAttribute("aria-orientation")).toBe("vertical");
		expect(handle.getAttribute("aria-controls")).toBe(f.pane().id);
		expect(handle.getAttribute("aria-valuemin")).toBe("280");
		expect(handle.getAttribute("aria-valuemax")).toBe("680");
		await f.pointer("pointerdown", 600);
		expect(browser.captures.get(1)).toBe(handle);
		await f.pointer("pointermove", 300, 2);
		await f.pointer("pointercancel", 300, 2);
		expect(f.width()).toBe(374);
		expect(browser.captures.get(1)).toBe(handle);
		await f.pointer("pointermove", 520, 1, document.body);
		expect(f.width()).toBe(454);
		expect(f.pane().style.width).toBe("454px");
		expect(f.saved()).toBeNull();
		await f.pointer("pointerup", 500, 1, document.body);
		expect(f.width()).toBe(474);
		expect(f.saved()).toBe(474);
		expect(JSON.parse(f.stored()).state.width).toBe(474);
		expect(browser.captures.size).toBe(0);
		await f.pointer("pointermove", 300);
		expect(f.width()).toBe(474);
	} finally {
		await f.close();
	}
});

test.each(["pointercancel", "lostpointercapture", "Escape", "blur"])("cancels a drag on %s", async (reason) => {
	const f = await resizeFixture(browser, 420);
	try {
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", 500);
		expect(f.width()).toBe(520);
		if (reason === "Escape") await f.key("Escape");
		else if (reason === "blur") await act(async () => window.dispatchEvent(new Event("blur")));
		else await f.pointer(reason, 500);
		expect(f.width()).toBe(420);
		expect(f.saved()).toBe(420);
		expect(browser.captures.size).toBe(0);
	} finally {
		await f.close();
	}
});

test("uses arrow, Shift, Home, and End keys within current bounds", async () => {
	const f = await resizeFixture(browser);
	try {
		await f.key("ArrowLeft");
		expect(f.width()).toBe(390);
		await f.key("ArrowRight", true);
		expect(f.width()).toBe(326);
		await f.key("Home");
		expect(f.width()).toBe(280);
		await f.key("ArrowRight");
		expect(f.width()).toBe(280);
		await f.key("End");
		expect(f.width()).toBe(680);
		await f.key("ArrowLeft");
		expect(f.width()).toBe(680);
		expect(f.handle().getAttribute("aria-valuetext")).toBe("680 pixels");
	} finally {
		await f.close();
	}
});

test("recalculates parent bounds without replacing the saved preference", async () => {
	const f = await resizeFixture(browser, 600);
	try {
		await f.resize(700);
		expect(f.width()).toBe(380);
		expect(f.handle().getAttribute("aria-valuemax")).toBe("380");
		expect(f.saved()).toBe(600);
		await f.resize(500);
		expect(f.width()).toBe(250);
		expect(f.handle().getAttribute("aria-valuemin")).toBe("250");
		expect(f.handle().getAttribute("aria-valuemax")).toBe("250");
		expect(f.handle().getAttribute("aria-disabled")).toBe("true");
		expect(f.handle().tabIndex).toBe(-1);
		await f.key("ArrowLeft");
		await f.pointer("pointerdown", 450);
		expect(browser.captures.size).toBe(0);
		expect(f.saved()).toBe(600);
		await f.resize(1_000);
		expect(f.width()).toBe(600);
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", -5_000);
		expect(f.width()).toBe(680);
		await f.resize(700);
		expect(f.width()).toBe(380);
		await f.pointer("pointerup", 5_000);
		expect(f.width()).toBe(280);
	} finally {
		await f.close();
	}
});

test("retains width through loading, error, empty, populated, session changes, and observer toggles", async () => {
	const f = await resizeFixture(browser);
	try {
		expect(f.container.textContent).toContain("Load agent status");
		await f.key("ArrowLeft", true);
		const width = f.width();
		await f.fail("session-a");
		expect(f.container.textContent).toContain("The agent status did not load");
		expect(f.width()).toBe(width);
		await f.view({ runId: "session-b" });
		expect(f.width()).toBe(width);
		await f.answer("session-b", empty);
		expect(f.container.textContent).toContain("No update yet");
		expect(f.width()).toBe(width);
		await f.view({ runId: "session-c" });
		await f.answer("session-c", populated);
		expect(f.container.querySelector('[role="tree"]')).not.toBeNull();
		await f.view({ observerError: "Observer is unavailable" });
		expect(f.container.textContent).toContain("Observer is unavailable");
		expect(f.width()).toBe(width);
		await f.view({ enabled: false });
		expect(f.pane()).toBeNull();
		await f.view({ enabled: true, observerError: null });
		expect(f.width()).toBe(width);
		await f.rehydrate(f.stored());
		expect(f.width()).toBe(width);
	} finally {
		await f.close();
	}
});

test("retains the mounted timeline, selection, scroll viewport, and transcript during a drag", async () => {
	const f = await resizeFixture(browser);
	try {
		await f.answer("session-a", populated);
		const tree = f.container.querySelector('[role="tree"]')!;
		const row = tree.querySelector<HTMLElement>('[data-update-id="update-b"]')!;
		await act(async () => row.click());
		const viewport = tree.closest<HTMLElement>(".overflow-auto")!;
		viewport.scrollTop = 137;
		const transcript = f.container.querySelector("[data-transcript]")!;
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", 520);
		await f.pointer("pointerup", 510);
		expect(f.container.querySelector('[role="tree"]')).toBe(tree);
		expect(tree.querySelector('[data-update-id="update-b"]')).toBe(row);
		expect(row.getAttribute("aria-selected")).toBe("true");
		expect(tree.closest(".overflow-auto")).toBe(viewport);
		expect(viewport.scrollTop).toBe(137);
		expect(f.container.querySelector("[data-transcript]")).toBe(transcript);
		expect(transcript.querySelector("input")!.value).toBe("Unsent message");
	} finally {
		await f.close();
	}
});

test("removes the handle and inline width in the narrow layout and cancels an active drag", async () => {
	const f = await resizeFixture(browser, 420);
	try {
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", 500);
		await f.narrow(true);
		expect(f.handle()).toBeNull();
		expect(f.pane().style.width).toBe("");
		expect(f.pane().classList.contains("max-md:w-full")).toBe(true);
		expect(f.pane().classList.contains("max-md:order-first")).toBe(true);
		expect(f.pane().classList.contains("max-md:max-h-130")).toBe(true);
		expect(browser.captures.size).toBe(0);
		expect(f.saved()).toBe(420);
		await f.narrow(false);
		expect(f.width()).toBe(420);
	} finally {
		await f.close();
	}
});

test("releases pointer capture on unmount without saving the draft", async () => {
	const f = await resizeFixture(browser, 420);
	try {
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", 500);
		await f.view({ enabled: false });
		expect(browser.captures.size).toBe(0);
		expect(f.saved()).toBe(420);
		await f.view({ enabled: true });
		expect(f.width()).toBe(420);
	} finally {
		await f.close();
	}
});

test("cancels an unfinished loading-shell drag when the history arrives", async () => {
	const f = await resizeFixture(browser, 420);
	try {
		await f.pointer("pointerdown", 600);
		await f.pointer("pointermove", 500);
		await f.answer("session-a", populated);
		expect(browser.captures.size).toBe(0);
		expect(f.width()).toBe(420);
		expect(f.saved()).toBe(420);
	} finally {
		await f.close();
	}
});

test("keeps resizing usable when the browser refuses preference writes", async () => {
	const f = await resizeFixture(browser);
	const write = spyOn(localStorage, "setItem").mockImplementation(() => {
		throw new Error("Storage is unavailable");
	});
	try {
		await f.key("ArrowLeft");
		expect(f.width()).toBe(390);
		expect(f.saved()).toBe(390);
	} finally {
		write.mockRestore();
		await f.close();
	}
});

test.each(["bad JSON", '{"state":{"width":-10}}', '{"state":{"width":"wide"}}', '{"state":{"width":1e999}}'])(
	"ignores an invalid browser preference: %s",
	async (stored) => {
		const f = await resizeFixture(browser);
		try {
			await f.rehydrate(stored);
			expect(f.width()).toBe(374);
		} finally {
			await f.close();
		}
	},
);
