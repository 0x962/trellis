import type { HostDescriptor } from "./hostIdentity.ts";

export type HostCompatibility =
	| { compatible: true }
	| {
			compatible: false;
			field: "apiVersion" | "runtimeProtocol";
			expected: string | number;
			actual: string | number;
		};

export const hostCompatibility = (
	descriptor: HostDescriptor,
	expected: Pick<HostDescriptor, "apiVersion" | "runtimeProtocol">,
): HostCompatibility => {
	if (descriptor.apiVersion !== expected.apiVersion) {
		return {
			compatible: false,
			field: "apiVersion",
			expected: expected.apiVersion,
			actual: descriptor.apiVersion,
		};
	}
	if (descriptor.runtimeProtocol !== expected.runtimeProtocol) {
		return {
			compatible: false,
			field: "runtimeProtocol",
			expected: expected.runtimeProtocol,
			actual: descriptor.runtimeProtocol,
		};
	}
	return { compatible: true };
};
