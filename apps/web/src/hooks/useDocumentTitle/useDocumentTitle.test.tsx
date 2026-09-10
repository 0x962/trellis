import { beforeEach, describe, expect, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { createFakeServer } from "../../../test/fake-server";
import { mockMatchMedia } from "../../../test/media";
import { renderApp } from "../../../test/renderWithProviders";
import { needsYouCount } from "../../features/needs-you/utils/needsYouCount";
import { documentTitle } from "./useDocumentTitle";

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
	document.title = "trellis";
});

describe("hooks/useDocumentTitle", () => {
	test("documentTitle names each page and ends with trellis", () => {
		expect(documentTitle("/needs-you", 3)).toBe("Needs you (3) · trellis");
		expect(documentTitle("/needs-you", 0)).toBe("Needs you · trellis");
		expect(documentTitle("/all", 3)).toBe("All tickets · trellis");
		expect(documentTitle("/all/board", 3)).toBe("All tickets · trellis");
		expect(documentTitle("/p/CDE/web", 3)).toBe("CDE › web · trellis");
		expect(documentTitle("/p/CDE/web/board", 3)).toBe("CDE › web · trellis");
		expect(documentTitle("/p/CDE/settings", 3)).toBe("CDE › Settings · trellis");
		expect(documentTitle("/settings", 3)).toBe("Settings · trellis");
		expect(documentTitle("/search", 3)).toBe("Search · trellis");
		expect(documentTitle("/t/CDE-42", 3)).toBeNull();
	});

	// Each route sets its tab title. The ticket page sets its own title.
	test("the shell sets the tab title of the page it shows", async () => {
		const server = createFakeServer();
		const count = needsYouCount(await server.client.inbox.get({}));
		const { router } = renderApp({ path: "/needs-you", actor: "navid", server });
		await waitFor(() => expect(document.title).toBe(`Needs you (${count}) · trellis`));
		await router.navigate({ to: "/all" });
		await waitFor(() => expect(document.title).toBe("All tickets · trellis"));
		await router.navigate({ to: "/p/$", params: { _splat: "CDE/web" } });
		await waitFor(() => expect(document.title).toBe("CDE › web · trellis"));
		await router.navigate({ to: "/settings" });
		await waitFor(() => expect(document.title).toBe("Settings · trellis"));
	});
});
