import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";
import { connect } from "../../../test/connect";
import type { Recorder } from "../../../test/record";
import { renderNeedsYou } from "../../../test/renderNeedsYou";

let net: Recorder;

describe("NeedsYou", () => {
	beforeEach(() => {
		net = connect();
	});

	afterEach(() => net.restore());

	// TRL-62. No ticket goes to Needs you, so the screen asks the server
	// for nothing and draws nothing.
	test("the screen is empty and sends no request", async () => {
		await renderNeedsYou();
		expect(screen.getByTestId("needs-you-body")).toBeEmptyElement();
		expect(net.calls).toEqual([]);
	});
});
