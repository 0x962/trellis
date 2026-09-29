import { expect, test } from "bun:test";
import {
	createDenseGraphFixture,
	denseGraphCases,
} from "../../../../reports/langflow-large-graph-design/denseGraph/denseGraph.ts";
import { createGatewayProtocol, probeSessionCookie } from "./gatewayProtocol.ts";
import { probeGraph } from "./probeGraph.ts";

test("uses the seven-node fixture when no case is selected", () => {
	expect(probeGraph(undefined).nodes).toHaveLength(7);
});

test("rejects an unknown fixture name", () => {
	expect(() => probeGraph("missing-fixture")).toThrow("Unknown editor fixture");
});

for (const dimensions of denseGraphCases) {
	test(`serves ${dimensions.name} at the initial revision`, () => {
		const graphDocument = probeGraph(dimensions.name);
		expect(graphDocument.nodes).toHaveLength(dimensions.nodeCount);
		expect(graphDocument.edges).toHaveLength(dimensions.edgeCount);
		const source = createDenseGraphFixture(dimensions).graph;
		expect(graphDocument.edges).toEqual(source.edges);
		expect(graphDocument.viewport).toEqual(source.viewport);
		for (const [index, node] of graphDocument.nodes.entries()) {
			expect(node.data).toEqual(source.nodes[index]!.data);
			expect(node.id).toBe(source.nodes[index]!.id);
			expect(node.position.x).toBe(source.nodes[index]!.position.x);
		}
		expect(graphDocument.nodes[20]!.position.y).toBe(800);
		const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z", graphDocument });
		const response = gateway.dispatch({
			method: "GET",
			path: "/api/trellis-editor/v1/document",
			headers: { cookie: probeSessionCookie },
			bodyText: "",
			now: "2026-09-29T08:00:00Z",
		});
		expect(response).toMatchObject({ status: 200, body: { revision: 2, graphDocument } });
	});
}

test("requires a current grant for the actual-editor frame", () => {
	const gateway = createGatewayProtocol({ expiresAt: "2026-09-29T08:15:00Z" });
	const request = {
		method: "GET",
		path: "/__probe/narrow",
		headers: { cookie: probeSessionCookie },
		bodyText: "",
		now: "2026-09-29T08:00:00Z",
	};
	const response = gateway.dispatch(request);
	expect(response.status).toBe(200);
	expect(response.body).toContain("width:320px");
	expect(response.body).toContain('<iframe title="Actual Langflow editor at 320 pixels" src="/flow/');
	expect(gateway.dispatch({ ...request, headers: {} }).status).toBe(401);
	expect(gateway.dispatch({ ...request, now: "2026-09-29T08:15:00Z" }).status).toBe(403);
});
