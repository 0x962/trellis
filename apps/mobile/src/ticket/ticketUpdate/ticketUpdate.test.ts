import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { ticket } from "../../../test/fixtures";
import { updateMessage } from "./ticketUpdate";

const conflict = () =>
	new ORPCError("VERSION_CONFLICT", {
		defined: true,
		status: 412,
		message: "The ticket changed since the version you sent.",
		data: { current: ticket({ version: 9 }) },
	});

describe("ticket/ticketUpdate", () => {
	// TU-01
	test("updateMessage names the ticket of a version conflict", () => {
		expect(updateMessage(conflict())).toBe("CDE-42 changed first. The row shows the other version.");
	});

	// TU-02
	test("updateMessage shows the message of another rejection", () => {
		expect(updateMessage(new Error("The server is unreachable."))).toBe("The server is unreachable.");
		expect(updateMessage("offline")).toBe("offline");
	});
});
