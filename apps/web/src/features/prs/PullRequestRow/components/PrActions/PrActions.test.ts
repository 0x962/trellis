import { expect, test } from "bun:test";
import { removeQuestion } from "./PrActions";

test("the remove question names the pull request number and the ticket", () => {
	expect(removeQuestion({ number: 57080 }, { identifier: "OP-43" })).toBe("Remove #57080 from OP-43?");
});
