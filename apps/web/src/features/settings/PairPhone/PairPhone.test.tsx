import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import jsQR from "jsqr";
import { createFakeServer } from "../../../../test/fake-server";
import { mockMatchMedia } from "../../../../test/media";
import { renderApp } from "../../../../test/renderWithProviders";

// The Pair a phone row of the settings page. A server that listens on a
// network address shows a QR code of the pair link; a server on loopback only
// shows the command that opens it and says what opening it means.

beforeEach(() => {
	localStorage.clear();
	mockMatchMedia(false);
});

const lan = "http://192.168.1.20:4521";
const command = "trellis install --host 0.0.0.0";

const pairRow = async () => (await screen.findByText("Pair a phone")).closest("[data-settings-row]") as HTMLElement;

// Draws the SVG the way a camera sees it, 4 px per module on white, and reads
// it with a QR decoder. The code draws one unit square per dark module as
// `M<x> <y>h1v1h-1z`, and the view box holds the quiet zone around them.
const decode = (svg: Element) => {
	const [minX, minY, width] = svg.getAttribute("viewBox")!.split(" ").map(Number) as [number, number, number];
	const scale = 4;
	const side = width * scale;
	const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
	const d = svg.querySelector("path")!.getAttribute("d")!;
	for (const [, x, y] of d.matchAll(/M(-?\d+) (-?\d+)h1v1h-1z/g)) {
		const left = (Number(x) - minX) * scale;
		const top = (Number(y) - minY) * scale;
		for (let row = top; row < top + scale; row++) {
			for (let column = left; column < left + scale; column++) {
				const at = (row * side + column) * 4;
				pixels[at] = 0;
				pixels[at + 1] = 0;
				pixels[at + 2] = 0;
			}
		}
	}
	return jsQR(pixels, side, side)?.data;
};

describe("Pair a phone", () => {
	test("a server on loopback shows the command that opens it and the no-auth warning, and no QR code", async () => {
		const server = createFakeServer();
		server.state.addresses = ["http://127.0.0.1:4521"];
		renderApp({ path: "/settings", actor: "navid", server });

		const row = await pairRow();

		expect(row.textContent).toContain(command);
		expect(row.textContent).toMatch(/no auth/i);
		expect(row.textContent).toMatch(/anyone on the network/i);
		expect(row.querySelector("svg[role='img']")).toBeNull();
	});

	test("a server on a network address shows a QR code of the exact pair link and the URL", async () => {
		const server = createFakeServer();
		server.state.addresses = ["http://127.0.0.1:4521", lan, "http://10.0.0.9:4521"];
		renderApp({ path: "/settings", actor: "navid", server });

		const qr = await screen.findByRole("img", { name: /QR code/i });
		const row = await pairRow();

		expect(decode(qr)).toBe("trellis://pair?url=http%3A%2F%2F192.168.1.20%3A4521");
		expect(row.textContent).toContain(lan);
		expect(row.textContent).not.toContain(command);
	});

	// The encoder is in its own chunk, so a settings visit that never shows a
	// QR code never downloads it.
	test("the QR encoder loads in a lazy chunk", () => {
		const source = readFileSync(join(import.meta.dir, "PairPhone.tsx"), "utf8");
		expect(source).toContain('import("./components/PairQr")');
		expect(source).not.toMatch(/from "uqr"|from "\.\/components\/PairQr"/);
	});
});
