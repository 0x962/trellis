import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// macOS keys a privacy grant (Desktop, Documents, network volumes, Full Disk
// Access) to the designated requirement of the signed app. An ad-hoc signature
// makes that requirement the hash of one build, so every install asks again.
// A signature from this certificate makes the requirement
// `identifier "com.trellis.desktop" and certificate leaf = H"<hash>"`, which
// stays the same across builds while the certificate stays in the keychain.
export const localSigningName = "Trellis Local Signing";

const keychain = join(homedir(), "Library/Keychains/login.keychain-db");

const certificateConfig = `[req]
distinguished_name = subject
prompt = no
x509_extensions = codeSigning
[subject]
CN = ${localSigningName}
[codeSigning]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
`;

// `security find-identity -p codesigning` lists each identity as
// `  1) <SHA-1> "<name>"`, with "(CSSMERR_TP_NOT_TRUSTED)" after a self-signed
// one. codesign signs with an untrusted certificate when it gets the SHA-1.
export const findSigningIdentity = (output: string, name: string) =>
	output
		.split("\n")
		.map((line) => /^\s*\d+\) ([0-9A-F]{40}) "(.*)"/.exec(line))
		.find((match) => match?.[2] === name)?.[1];

const listIdentities = () =>
	execFileSync("/usr/bin/security", ["find-identity", "-p", "codesigning", keychain], { encoding: "utf8" });

// `-T /usr/bin/codesign` lets codesign use the private key without a keychain
// prompt. The certificate needs no trust setting, so the import asks for no
// password. The p12 password protects the file only while it exists here.
const createIdentity = () => {
	const directory = mkdtempSync(join(tmpdir(), "trellis-signing-"));
	const openssl = (...args: string[]) => execFileSync("/usr/bin/openssl", args, { cwd: directory, stdio: "pipe" });
	const password = randomUUID();
	writeFileSync(join(directory, "certificate.cnf"), certificateConfig);
	openssl(
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-days",
		"36500",
		"-config",
		"certificate.cnf",
		"-keyout",
		"key.pem",
		"-out",
		"certificate.pem",
	);
	openssl(
		"pkcs12",
		"-export",
		"-inkey",
		"key.pem",
		"-in",
		"certificate.pem",
		"-out",
		"identity.p12",
		"-passout",
		`pass:${password}`,
	);
	execFileSync(
		"/usr/bin/security",
		["import", join(directory, "identity.p12"), "-k", keychain, "-P", password, "-T", "/usr/bin/codesign"],
		{ stdio: "inherit" },
	);
	rmSync(directory, { recursive: true });
};

// Returns the SHA-1 of the Trellis signing certificate in the login keychain.
// The first call on a machine creates the certificate, and every later build
// reuses it.
export const ensureLocalSigningIdentity = () => {
	const existing = findSigningIdentity(listIdentities(), localSigningName);
	if (existing) return existing;
	createIdentity();
	const created = findSigningIdentity(listIdentities(), localSigningName);
	if (!created) throw new Error(`The login keychain has no "${localSigningName}" identity after the import.`);
	return created;
};
