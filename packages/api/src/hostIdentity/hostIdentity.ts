import { z } from "zod";
import { UlidSchema } from "../schemas/primitives.ts";

export const HostIdSchema = UlidSchema.brand<"HostId">();
export type HostId = z.infer<typeof HostIdSchema>;

export const DataHomeIdSchema = UlidSchema.brand<"DataHomeId">();
export type DataHomeId = z.infer<typeof DataHomeIdSchema>;

export const HostPlatformSchema = z.enum(["darwin", "linux"]);
export type HostPlatform = z.infer<typeof HostPlatformSchema>;

export const HostArchitectureSchema = z.enum(["x64", "arm64"]);
export type HostArchitecture = z.infer<typeof HostArchitectureSchema>;

export const HostCapabilitySchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
export type HostCapability = z.infer<typeof HostCapabilitySchema>;

export const HostDescriptorSchema = z.strictObject({
	hostId: HostIdSchema,
	dataHomeId: DataHomeIdSchema,
	apiVersion: z.string().min(1),
	runtimeProtocol: z.number().int().nonnegative(),
	releaseId: z.string().min(1),
	platform: HostPlatformSchema,
	arch: HostArchitectureSchema,
	capabilities: z.array(HostCapabilitySchema),
});
export type HostDescriptor = z.infer<typeof HostDescriptorSchema>;
