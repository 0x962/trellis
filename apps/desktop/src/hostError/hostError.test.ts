import { expect, test } from "bun:test";
import { hostError } from "./hostError.ts";

const json = (body: unknown, status = 400) =>
	new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (body: string, status = 500) => new Response(body, { status, headers: { "content-type": "text/plain" } });

test("a declared host error becomes its message and its code", async () => {
	const error = await hostError(
		json({ code: "NATIVE_WORK_BUSY", status: 409, message: "Local work is already stopped." }),
	);

	expect(error.message).toBe("Local work is already stopped. (NATIVE_WORK_BUSY)");
});

test("a JSON body without a code becomes the message alone", async () => {
	const error = await hostError(json({ message: "The restart plan has no agents." }));

	expect(error.message).toBe("The restart plan has no agents.");
});

test("a JSON body without a message becomes the trimmed body", async () => {
	const error = await hostError(json({ data: { reason: "locked" } }));

	expect(error.message).toBe('{"data":{"reason":"locked"}}');
});

test("a plain text answer loses its surrounding blank lines", async () => {
	const error = await hostError(text("\nBad gateway\n\n"));

	expect(error.message).toBe("Bad gateway");
});

test("an empty answer names the status code", async () => {
	const error = await hostError(new Response("", { status: 502 }));

	expect(error.message).toBe("The host answered HTTP 502.");
});
