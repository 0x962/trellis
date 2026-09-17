import { expect, test } from "@playwright/test";
import type { ChatMessage } from "@trellis/api";
import { post } from "./api";
import { mapRpcResponse } from "./mapRpcResponse";
import { signIn } from "./support";

test.use({ locale: "en-CA", timezoneId: "America/Toronto" });

test("chat groups and labels messages by the browser date", async ({ page }) => {
	await post("/projects", { key: "CHAT", name: "Chat time tests" });
	const suffix = Date.now();
	const beforeBody = `Before local midnight ${suffix}`;
	const afterBody = `After local midnight ${suffix}`;
	const before = await post<ChatMessage>("/projects/CHAT/chat/general/messages", { body: beforeBody });
	const after = await post<ChatMessage>("/projects/CHAT/chat/general/messages", { body: afterBody });
	const createdAt = new Map([
		[before.id, "2026-01-01T01:30:00.000Z"],
		[after.id, "2026-01-01T05:30:00.000Z"],
	]);
	await page.route("**/rpc/**", (route) =>
		mapRpcResponse(route, (_key, value) => {
			if (typeof value !== "object" || value === null || !("id" in value)) return value;
			const localCreatedAt = createdAt.get(String(value.id));
			return localCreatedAt === undefined ? value : { ...value, createdAt: localCreatedAt };
		}),
	);
	await signIn(page, "/p/CHAT/chat");
	await page
		.getByRole("navigation", { name: "Channels" })
		.getByRole("button", { name: /general/ })
		.click();

	const expected = await page.evaluate(() => {
		const date = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
		const clock = new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
		});
		const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });
		const beforeDate = new Date("2026-01-01T01:30:00.000Z");
		const afterDate = new Date("2026-01-01T05:30:00.000Z");
		return {
			beforeDate: date.format(beforeDate),
			afterDate: date.format(afterDate),
			beforeClock: clock.format(beforeDate),
			beforeTitle: full.format(beforeDate),
		};
	});
	const beforeLine = page.getByText(beforeBody, { exact: true }).locator("xpath=ancestor::li[1]");
	const afterLine = page.getByText(afterBody, { exact: true }).locator("xpath=ancestor::li[1]");

	await expect(beforeLine.locator("time")).toHaveText(expected.beforeClock);
	await expect(beforeLine.locator("time")).toHaveAttribute("title", expected.beforeTitle);
	await expect(beforeLine.locator("xpath=preceding-sibling::li[1]")).toHaveText(expected.beforeDate);
	await expect(afterLine.locator("xpath=preceding-sibling::li[1]")).toHaveText(expected.afterDate);
});
