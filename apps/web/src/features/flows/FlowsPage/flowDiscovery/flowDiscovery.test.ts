import { describe, expect, it } from "bun:test";
import {
	FlowDocumentV1Schema,
	FlowUpdateInputSchema,
	pendingDocumentV1Example,
	publicationV1Example,
} from "@trellis/api";
import { flowSettingsRequest } from "../../FlowEditor/components/FlowSettingsSheet/flowSettingsRequest";
import { flowSettingsState } from "../../FlowEditor/components/FlowSettingsSheet/flowSettingsState";
import { flowPublicationReceipt } from "../flowPublicationReceipt";
import { flowDiscovery } from "./flowDiscovery";
import {
	blockedDiscoveryEntry,
	deletedFlowFixture,
	discoveryFixture,
	metadataConflictFixture,
	pendingDiscoveryEntry,
	preservedFlowFilters,
	publishedDiscoveryEntry,
	settingsFixture,
	stalePublicationFixture,
} from "./flowDiscovery.fixtures";

describe("versioned discovery source", () => {
	it("keeps the shared fixture documents valid", () => {
		for (const entry of [pendingDiscoveryEntry, publishedDiscoveryEntry, blockedDiscoveryEntry]) {
			expect(FlowDocumentV1Schema.safeParse(entry.document).success).toBe(true);
		}
	});
	it("distinguishes empty, filtered, failed, and engine states", () => {
		expect(flowDiscovery({ ...discoveryFixture, load: { state: "loaded", entries: [] } }).state).toBe("empty");
		expect(flowDiscovery({ ...discoveryFixture, filters: { ...preservedFlowFilters, query: "missing" } }).state).toBe(
			"no_matches",
		);
		const failure = flowDiscovery({ ...discoveryFixture, load: { state: "failed", message: "Offline" } });
		expect(failure.state).toBe("failed");
		expect(failure.filters).toEqual(preservedFlowFilters);
		const unavailable = flowDiscovery({ ...discoveryFixture, engine: { state: "unavailable", reason: "Offline" } });
		expect(unavailable.state).toBe("populated");
		expect(unavailable.engine.state).toBe("unavailable");
	});
	it("keeps global flows in a project filter and searches descriptions", () => {
		const entry = {
			...pendingDiscoveryEntry,
			document: {
				...pendingDocumentV1Example,
				flow: { ...pendingDocumentV1Example.flow, project: null, name: "Audit" },
			},
		};
		const view = flowDiscovery({
			...discoveryFixture,
			filters: { query: "PROPOSED", project: "OTHER" },
			load: { state: "loaded", entries: [entry] },
		});
		expect(view.state).toBe("populated");
		expect(flowDiscovery({ ...discoveryFixture, filters: { query: "", project: "OTHER" } }).state).toBe("no_matches");
	});
	it("keeps blocked conversion discoverable without a run capability guess", () => {
		const view = flowDiscovery({ ...discoveryFixture, load: { state: "loaded", entries: [blockedDiscoveryEntry] } });
		expect(view.state).toBe("populated");
		expect(blockedDiscoveryEntry.capabilities.start.state).toBe("unknown");
	});
	it("rejects stale and mismatched publication receipts", () => {
		for (const receipt of [
			stalePublicationFixture,
			{ ...publicationV1Example, flowId: "00000000000000000000000099" },
			{ ...publicationV1Example, documentHash: "f".repeat(64) },
			{ ...publicationV1Example, componentManifestHash: "f".repeat(64) },
		])
			expect(flowPublicationReceipt(pendingDocumentV1Example, receipt)).toBe(pendingDocumentV1Example);
		const published = flowPublicationReceipt(pendingDocumentV1Example, publicationV1Example);
		expect(published.publication.state).toBe("published");
		expect(published.lastExecutablePublication).toEqual(publicationV1Example);
		expect(
			flowPublicationReceipt(published, { ...publicationV1Example, publicationId: "00000000000000000000000099" }),
		).toBe(published);
	});
	it("retains metadata edits and filters after conflict or deletion", () => {
		const conflict = flowSettingsState(settingsFixture, { type: "conflict", serverVersion: 3 });
		expect(conflict).toEqual(metadataConflictFixture);
		expect(flowSettingsRequest(conflict)).toBeNull();
		expect(
			flowSettingsRequest(
				flowSettingsState(conflict, { type: "edit", draft: { ...conflict.draft, name: "More edits" } }),
			),
		).toBeNull();
		const deleted = flowSettingsState(settingsFixture, { type: "deleted" });
		expect(deleted).toEqual(deletedFlowFixture);
		expect(deleted.filters).toEqual(preservedFlowFilters);
		expect(deleted.draft.slug).toBe("my-review");
		expect(flowSettingsRequest(deleted)).toBeNull();
	});
	it("addresses metadata by stable ID and the version the person edited", () => {
		expect(FlowUpdateInputSchema.safeParse(flowSettingsRequest(settingsFixture)).success).toBe(true);
		expect(flowSettingsRequest(settingsFixture)).toMatchObject({
			flow: settingsFixture.flow.id,
			expectedVersion: 2,
			slug: "my-review",
			name: "My review",
		});
	});
});
