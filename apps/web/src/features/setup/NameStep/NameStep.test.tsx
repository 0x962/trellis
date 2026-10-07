import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "test-renderer";
import { type AppContext, AppProvider } from "../../../lib/appContext";
import { NameStep } from "./NameStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test("associates an invalid actor name message with the name field", async () => {
	const root = createRoot();
	await act(async () => {
		root.render(
			<AppProvider value={{} as AppContext}>
				<NameStep suggested="José" onDone={() => {}} />
			</AppProvider>,
		);
	});
	const input = root.container.queryAll((node) => node.type === "input")[0]!;
	const messageId = input.props["aria-describedby"];
	const message = root.container.queryAll((node) => node.props.id === messageId)[0]!;

	expect(input.props["aria-invalid"]).toBe(true);
	expect(message.props.role).toBe("alert");
	expect(message.children.join("")).toBe("Use printable ASCII characters without a colon.");

	await act(async () => root.unmount());
});
