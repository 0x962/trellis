import { expect, test } from "bun:test";
import type { WaveSummary } from "@trellis/api";
import { renderToStaticMarkup } from "react-dom/server";
import type { WaveEditing } from "../../../hooks/useWaveEditing";
import { WaveName } from "./WaveName";

const wave = { id: "w1", ref: "OP/epic/w1", name: "Wave 2" } as WaveSummary;
const editing = {
	renamingId: "w1",
	rename: async () => {},
	endRename: () => {},
} as unknown as WaveEditing;

test("the name of the wave stands in a text field of the in-place edit", () => {
	const html = renderToStaticMarkup(<WaveName wave={wave} editing={editing} />);

	expect(html).toContain('data-inline-edit="editing"');
	expect(html).toContain('value="Wave 2"');
	expect(html).toContain("Wave name");
});
