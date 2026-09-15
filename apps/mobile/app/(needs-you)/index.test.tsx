import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { screen, within } from "expo-router/testing-library";
import { queryClient } from "../../src/lib/queryClient";
import { connect } from "../../test/connect";
import type { Recorder } from "../../test/record";
import { renderRoute } from "../../test/renderRoute";
import { reset, seedProject, seedTicket } from "../../test/seed";
import { seeder } from "../../test/server";

// The tab item's role is `button` on iOS and `tab` elsewhere.
const tabRole = /^(button|tab)$/;
const tab = () => screen.getByRole(tabRole, { name: "Needs you" });

let net: Recorder;

describe("the Needs you tab", () => {
	beforeEach(async () => {
		queryClient.clear();
		await reset(seeder);
		net = connect();
	});

	afterEach(() => net.restore());

	// TRL-62. A ticket in Human Review puts nothing on the tab: the screen
	// stays empty and the tab carries no badge.
	test("a ticket in Human Review leaves the tab empty and without a badge", async () => {
		const project = await seedProject(seeder, { key: "NYT", name: "Needs you tab" });
		await seedTicket(seeder, { project: project.path, title: "Read the release notes", status: "human-review" });
		await renderRoute("/");
		expect(await screen.findByTestId("needs-you-body")).toBeEmptyElement();
		expect(within(tab()).queryByText(/^\d+$/)).toBeNull();
	});
});
