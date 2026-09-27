import { expect, test } from "bun:test";
import { HostProfileAddInputSchema, HostProfileEditInputSchema, HostProfileListSchema } from "./hostProfiles.ts";

const remoteProfile = {
	id: "1d98cff5-5293-427c-87fd-f781b4b498b1",
	kind: "ssh" as const,
	label: "Workshop",
	address: "workshop.example.com",
	port: 22,
	username: "trellis",
	credentialRef: "4fbfdc1e-6bbf-4f1a-bfa5-0c5267482736",
	credentialPersistence: "secure" as const,
	hostKey: {
		algorithm: "ssh-ed25519",
		publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIE5vdEFQcm9kdWN0aW9uS2V5",
		fingerprint: "SHA256:ZmFrZUZpbmdlcnByaW50Rm9yVGVzdHM",
	},
	allocatedPort: 24_521,
	expectedHostId: "01M3J6CCTAGW0685MPGF1MXWDW",
	expectedDataHomeId: null,
};

test("accepts a sanitized SSH profile", () => {
	expect(HostProfileListSchema.parse([remoteProfile])).toEqual([remoteProfile]);
});

test("requires explicit trust when a caller adds an SSH profile", () => {
	const { id: _id, hostKey, ...input } = remoteProfile;

	expect(() => HostProfileAddInputSchema.parse({ ...input, hostKey })).toThrow();
	expect(HostProfileAddInputSchema.parse({ ...input, trustedHostKey: hostKey })).toMatchObject({
		trustedHostKey: hostKey,
	});
});

test("keeps a host key out of the general edit input", () => {
	expect(() =>
		HostProfileEditInputSchema.parse({
			id: remoteProfile.id,
			kind: "ssh",
			hostKey: remoteProfile.hostKey,
		}),
	).toThrow();
});

test("rejects two SSH profiles with the same loopback port", () => {
	expect(() =>
		HostProfileListSchema.parse([
			remoteProfile,
			{ ...remoteProfile, id: "b50115e8-d56a-4cb3-bf34-1c7592c5b586", label: "Office" },
		]),
	).toThrow("Each SSH profile needs a unique loopback port.");
});

test("rejects secrets and unknown fields", () => {
	expect(() => HostProfileListSchema.parse([{ ...remoteProfile, privateKey: "secret" }])).toThrow();
});

test("rejects SSH option injection in connection fields", () => {
	const { id: _id, hostKey, ...input } = remoteProfile;

	expect(() =>
		HostProfileAddInputSchema.parse({ ...input, address: "-oProxyCommand=bad", trustedHostKey: hostKey }),
	).toThrow();
	expect(() =>
		HostProfileAddInputSchema.parse({ ...input, username: "-oProxyCommand", trustedHostKey: hostKey }),
	).toThrow();
});
