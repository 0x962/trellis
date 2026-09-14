import { expect, test } from "bun:test";
import { dispatchMessageId } from "./messageId.ts";

test("one dispatch generation keeps a valid UUID across repeated sends", () => {
	const dispatch = { id: "01M2GHTTXSHPZDFTJQW1MC28N2", generation: 1 };
	const id = dispatchMessageId(dispatch);
	expect(id).toBe("cc6bf256-5fce-5491-a9d0-dcfb17e7906a");
	expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	expect(dispatchMessageId(dispatch)).toBe(id);
	expect(dispatchMessageId({ ...dispatch, generation: 2 })).not.toBe(id);
	expect(dispatchMessageId({ ...dispatch, id: "01M2GJ634MAAPPB8JDZVDYWX3B" })).not.toBe(id);
});
