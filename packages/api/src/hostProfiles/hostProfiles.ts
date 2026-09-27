import { z } from "zod";
import { DataHomeIdSchema, HostIdSchema } from "../hostIdentity/index.ts";

const LabelSchema = z
	.string()
	.trim()
	.min(1, "Enter a host name.")
	.max(80, "Enter a host name of 80 characters or less.")
	.regex(/^[^\p{Cc}]+$/u, "Enter a host name without control characters.");
const PortSchema = z.number().int().min(1).max(65_535);
const LoopbackPortSchema = z.number().int().min(1_024).max(65_535);
const AddressSchema = z
	.string()
	.trim()
	.min(1, "Enter a host address.")
	.max(255, "Enter a host address of 255 characters or less.")
	.regex(/^(?!-)[A-Za-z0-9_.:%-]+$/, "Enter a host name or an IP address.");
const UsernameSchema = z
	.string()
	.trim()
	.min(1, "Enter an SSH user name.")
	.max(255, "Enter an SSH user name of 255 characters or less.")
	.regex(/^[A-Za-z_][A-Za-z0-9_.-]*\$?$/, "Enter a valid SSH user name.");

export const HostProfileIdSchema = z.uuid();
export type HostProfileId = z.infer<typeof HostProfileIdSchema>;

export const HostCredentialRefSchema = z.uuid();
export type HostCredentialRef = z.infer<typeof HostCredentialRefSchema>;

export const SshHostKeyPinSchema = z.strictObject({
	algorithm: z.string().trim().min(1).max(100).regex(/^\S+$/),
	publicKey: z.string().trim().min(1).max(16_384).regex(/^[A-Za-z0-9+/]+={0,2}$/),
	fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{20,100}$/),
});
export type SshHostKeyPin = z.infer<typeof SshHostKeyPinSchema>;

const expectedIdentityFields = {
	expectedHostId: HostIdSchema.nullable(),
	expectedDataHomeId: DataHomeIdSchema.nullable(),
};

export const LocalHostProfileSchema = z.strictObject({
	id: HostProfileIdSchema,
	kind: z.literal("local"),
	label: LabelSchema,
	dataHome: z
		.string()
		.trim()
		.min(1)
		.max(4_096)
		.startsWith("/", "Enter an absolute data directory.")
		.regex(/^[^\p{Cc}]+$/u, "Enter a data directory without control characters."),
	...expectedIdentityFields,
});
export type LocalHostProfile = z.infer<typeof LocalHostProfileSchema>;

export const SshHostProfileSchema = z.strictObject({
	id: HostProfileIdSchema,
	kind: z.literal("ssh"),
	label: LabelSchema,
	address: AddressSchema,
	port: PortSchema,
	username: UsernameSchema,
	credentialRef: HostCredentialRefSchema,
	credentialPersistence: z.enum(["secure", "session"]),
	hostKey: SshHostKeyPinSchema,
	loopbackPort: LoopbackPortSchema,
	...expectedIdentityFields,
});
export type SshHostProfile = z.infer<typeof SshHostProfileSchema>;

export const HostProfileSchema = z.discriminatedUnion("kind", [LocalHostProfileSchema, SshHostProfileSchema]);
export type HostProfile = z.infer<typeof HostProfileSchema>;

export const HostProfileListSchema = z.array(HostProfileSchema).superRefine((profiles, ctx) => {
	const ids = new Set<string>();
	const ports = new Set<number>();
	for (const [index, profile] of profiles.entries()) {
		if (ids.has(profile.id))
			ctx.addIssue({ code: "custom", path: [index, "id"], message: "Each host profile needs a unique ID." });
		ids.add(profile.id);
		if (profile.kind !== "ssh") continue;
		if (ports.has(profile.loopbackPort))
			ctx.addIssue({
				code: "custom",
				path: [index, "loopbackPort"],
				message: "Each SSH profile needs a unique loopback port.",
			});
		ports.add(profile.loopbackPort);
	}
});

export const LocalHostProfileAddInputSchema = LocalHostProfileSchema.omit({ id: true });
export type LocalHostProfileAddInput = z.input<typeof LocalHostProfileAddInputSchema>;

export const SshHostProfileAddInputSchema = SshHostProfileSchema.omit({ id: true, hostKey: true }).extend({
	trustedHostKey: SshHostKeyPinSchema,
});
export type SshHostProfileAddInput = z.input<typeof SshHostProfileAddInputSchema>;

export const HostProfileAddInputSchema = z.discriminatedUnion("kind", [
	LocalHostProfileAddInputSchema,
	SshHostProfileAddInputSchema,
]);
export type HostProfileAddInput = z.input<typeof HostProfileAddInputSchema>;

export const LocalHostProfileEditInputSchema = z.strictObject({
	id: HostProfileIdSchema,
	kind: z.literal("local"),
	label: LabelSchema.optional(),
	dataHome: LocalHostProfileSchema.shape.dataHome.optional(),
	expectedHostId: HostIdSchema.nullable().optional(),
	expectedDataHomeId: DataHomeIdSchema.nullable().optional(),
});

export const SshHostProfileEditInputSchema = z.strictObject({
	id: HostProfileIdSchema,
	kind: z.literal("ssh"),
	label: LabelSchema.optional(),
	address: AddressSchema.optional(),
	port: PortSchema.optional(),
	username: UsernameSchema.optional(),
	credentialRef: HostCredentialRefSchema.optional(),
	credentialPersistence: SshHostProfileSchema.shape.credentialPersistence.optional(),
	loopbackPort: LoopbackPortSchema.optional(),
	expectedHostId: HostIdSchema.nullable().optional(),
	expectedDataHomeId: DataHomeIdSchema.nullable().optional(),
});

export const HostProfileEditInputSchema = z.discriminatedUnion("kind", [
	LocalHostProfileEditInputSchema,
	SshHostProfileEditInputSchema,
]);
export type HostProfileEditInput = z.input<typeof HostProfileEditInputSchema>;

export const HostProfileTrustKeyInputSchema = z.strictObject({
	id: HostProfileIdSchema,
	trustedHostKey: SshHostKeyPinSchema,
});
export type HostProfileTrustKeyInput = z.infer<typeof HostProfileTrustKeyInputSchema>;

export const HostProfileRemoveInputSchema = z.strictObject({ id: HostProfileIdSchema });
export type HostProfileRemoveInput = z.infer<typeof HostProfileRemoveInputSchema>;
