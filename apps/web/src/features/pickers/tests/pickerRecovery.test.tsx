import { expect, test } from "bun:test";
import { act, browser, fixture, wait } from "./pickerFixture";

for (const kind of ["epic", "wave", "label", "ticket"] as const) {
	test(`${kind} exposes a failed query and recovers through Retry`, async () => {
		const f = await fixture(kind);
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("could not load.");
		expect(document.body.textContent).not.toContain("No results.");
		expect(f.picked).toHaveLength(0);
		f.recover();
		await f.retry();
		expect(document.querySelector('[role="alert"]')).toBeNull();
		expect(f.calls()).toBe(2);
		expect(document.activeElement?.tagName).toBe("INPUT");
		expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
	});
}

test("a failed label list does not offer to create a label from unknown data", async () => {
	await fixture("label");
	await act(async () => {
		const input = document.querySelector("input")!;
		const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!;
		setter.call(input, "New label");
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	expect(document.body.textContent).not.toContain("No labels.");
	expect(document.body.textContent).not.toContain("Create label");
	expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
});

for (const kind of ["epic", "wave", "label"] as const) {
	test(`${kind} preserves cached options when a refresh fails`, async () => {
		await fixture(kind, true);
		expect(document.querySelector('[role="alert"]')).not.toBeNull();
		expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
	});
}

const typeSearch = async (value: string) =>
	act(async () => {
		const input = document.querySelector("input")!;
		Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});

for (const kind of ["epic", "wave"] as const) {
	test(`${kind} creates the typed record once and selects the returned record`, async () => {
		const f = await fixture(kind);
		f.recover();
		await f.retry();
		await typeSearch("  New record  ");
		const row = [...document.querySelectorAll('[role="option"]')].find((row) =>
			row.textContent?.includes(`Create ${kind}`),
		) as HTMLElement;
		expect(row).toBeDefined();
		await act(async () => {
			row.click();
			row.click();
		});
		await wait();
		expect(f.writes).toEqual([
			kind === "epic" ? { project: "PR", name: "New record" } : { epic: "PR/plan", name: "New record" },
		]);
		expect(f.picked).toHaveLength(1);
		expect(f.picked[0]).toMatchObject({ name: "New record", ref: kind === "epic" ? "PR/new" : "PR/plan/new" });
	});
	test(`${kind} keeps the typed name and reports a failed create`, async () => {
		const f = await fixture(kind);
		f.recover();
		await f.retry();
		f.failCreate();
		await typeSearch("New record");
		const row = [...document.querySelectorAll('[role="option"]')].find((row) =>
			row.textContent?.includes(`Create ${kind}`),
		) as HTMLElement;
		await act(async () => row.click());
		await wait();
		expect(document.querySelector('[role="alert"]')?.textContent).toContain("Creation refused");
		expect(document.querySelector("input")?.value).toBe("New record");
		expect(f.picked).toHaveLength(0);
	});
	test(`${kind} offers no creation for an exact name or an unavailable list`, async () => {
		const f = await fixture(kind);
		await typeSearch("New record");
		expect(document.body.textContent).not.toContain(`Create ${kind}`);
		f.recover();
		await f.retry();
		await typeSearch(kind === "epic" ? "pLaN" : "fIrSt WaVe");
		expect(document.body.textContent).not.toContain(`Create ${kind}`);
	});
}

for (const kind of ["epic", "wave"] as const) {
	for (const change of ["close", "scope", "target"] as const) {
		test(`${kind} ignores a late create after ${change}`, async () => {
			const f = await fixture(kind);
			f.recover();
			await f.retry();
			const finish = f.deferCreate();
			await typeSearch("New record");
			const row = [...document.querySelectorAll('[role="option"]')].find((row) =>
				row.textContent?.includes(`Create ${kind}`),
			) as HTMLElement;
			await act(async () => row.click());
			if (change !== "close") await f.changeScope(change === "target");
			else
				await act(async () =>
					document
						.querySelector("input")!
						.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
				);
			await act(async () => finish());
			await wait();
			expect(f.writes).toHaveLength(1);
			expect(f.picked).toHaveLength(0);
		});
	}
}
