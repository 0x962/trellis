import { randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lockHome } from "../../../homeLock";
import { type HostControlIdentity, LangflowHostControl } from "../../hostControl";

export function reconciliationIssuerPath(identity: HostControlIdentity) {
	if (!isDeepStrictEqual(LangflowHostControl.readIdentity(identity.home), identity))
		throw new Error("reconciliation_identity_changed");
	return join(LangflowHostControl.directory(identity.home), "reconciliation-issuer.key");
}

export function readReconciliationIssuer(identity: HostControlIdentity) {
	const fd = openSync(
		reconciliationIssuerPath(identity),
		constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
	);
	try {
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600)
			throw new Error("reconciliation_issuer_file_unsafe");
		const key = readFileSync(fd, "utf8");
		if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("reconciliation_issuer_invalid");
		return key;
	} finally {
		closeSync(fd);
	}
}

export function provisionReconciliationIssuer(identity: HostControlIdentity) {
	const path = reconciliationIssuerPath(identity);
	const directory = LangflowHostControl.directory(identity.home);
	const lock = lockHome(directory, "server", null);
	try {
		try {
			readReconciliationIssuer(identity);
			return path;
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
		}
		const fd = openSync(path, "wx", 0o600);
		try {
			writeFileSync(fd, randomBytes(32).toString("hex"));
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		const directoryFd = openSync(directory, "r");
		try {
			fsyncSync(directoryFd);
		} finally {
			closeSync(directoryFd);
		}
		return path;
	} finally {
		lock.release();
	}
}
