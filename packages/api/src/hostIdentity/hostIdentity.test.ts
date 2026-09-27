import { describe, expect, test } from "bun:test";
import { HostDescriptorSchema, hostCompatibility } from "./hostIdentity.ts";

const descriptor = () =>
	HostDescriptorSchema.parse({
		hostId: "01M3J7CVEHR52YM5AJVE8N9180",
		dataHomeId: "01M3J7CQ8AXSZDQCJ2NGB1X8VJ",
		apiVersion: "1",
		runtimeProtocol: 13,
		releaseId: "release-1",
		platform: "linux",
		arch: "x64",
		capabilities: ["host-identity"],
	});

describe("host identity contract", () => {
	test("accepts the supported host descriptor", () => {
		expect(descriptor()).toMatchObject({ apiVersion: "1", runtimeProtocol: 13 });
	});

	test("rejects an incompatible API version", () => {
		expect(hostCompatibility(descriptor(), { apiVersion: "2", runtimeProtocol: 13 })).toEqual({
			compatible: false,
			field: "apiVersion",
			expected: "2",
			actual: "1",
		});
	});

	test("rejects an incompatible runtime protocol", () => {
		expect(hostCompatibility(descriptor(), { apiVersion: "1", runtimeProtocol: 14 })).toEqual({
			compatible: false,
			field: "runtimeProtocol",
			expected: 14,
			actual: 13,
		});
	});
});
