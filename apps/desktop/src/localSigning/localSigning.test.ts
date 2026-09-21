import { expect, test } from "bun:test";
import { findSigningIdentity, localSigningName } from "./localSigning.ts";

const output = `
Policy: Code Signing
  Matching identities
  1) 3B3D4ABFDCFFDEDE6486054C33B47760254900FD "Apple Development: Dana (KZF46RA94S)"
  2) 7078D739EDC2660CBA6899AEE3494DB806E8EB47 "Trellis Local Signing" (CSSMERR_TP_NOT_TRUSTED)
     2 identities found

  Valid identities only
  1) 3B3D4ABFDCFFDEDE6486054C33B47760254900FD "Apple Development: Dana (KZF46RA94S)"
     1 valid identities found
`;

test("finds the untrusted Trellis identity by its exact name", () => {
	expect(findSigningIdentity(output, localSigningName)).toBe("7078D739EDC2660CBA6899AEE3494DB806E8EB47");
});

test("ignores a name that only contains the Trellis name", () => {
	const other = output.replace('"Trellis Local Signing"', '"Trellis Local Signing Old"');
	expect(findSigningIdentity(other, localSigningName)).toBeUndefined();
});

test("answers undefined when the keychain has no identity", () => {
	expect(findSigningIdentity("\nPolicy: Code Signing\n     0 identities found\n", localSigningName)).toBeUndefined();
});
