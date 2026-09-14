import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { RuntimeDiagnostics } from "./RuntimeDiagnostics";

test("runtime diagnostics retain unresolved work and its next action", () => {
	const view = render(
		<RuntimeDiagnostics
			runtime={{ state: "unavailable", protocol: null, expectedProtocol: 4, error: "Protocol mismatch" }}
			paused={true}
			queue={{ pending: 1, sending: 0, unknown: 2, oldestDueAt: "2026-09-14T12:00:00Z" }}
			lastObservationAt={null}
			unresolvedAttempts={[{ id: "run-1", state: "interrupted", error: "Process ownership unknown" }]}
			logs={["/tmp/fixture/server.log"]}
		/>,
	);
	expect(view.getByText("Local work is paused")).toBeDefined();
	expect(view.getByText("Protocol mismatch")).toBeDefined();
	expect(view.getByText("Process ownership unknown")).toBeDefined();
	expect(view.getByText(/Inspect unresolved attempts/)).toBeDefined();
});
