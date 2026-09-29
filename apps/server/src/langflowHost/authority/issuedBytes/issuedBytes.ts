import { isDeepStrictEqual } from "node:util";
import { DeliveryAuthorityV1Schema, protocolDigest } from "../../../langflowContracts";
import type { AuthorityCommit } from "../../contracts";

export function readIssuedAuthority(commit: AuthorityCommit) {
	const authority = DeliveryAuthorityV1Schema.parse(JSON.parse(commit.authorityBytes));
	if (!isDeepStrictEqual(authority, commit.receipt.authority)) throw new Error("issued_authority_mismatch");
	return {
		authority,
		authorityBytes: commit.authorityBytes,
		authorityDigest: protocolDigest(commit.authorityBytes),
		issuanceReceiptId: "renewalId" in commit.receipt ? commit.receipt.renewalId : commit.receipt.transferId,
	};
}
