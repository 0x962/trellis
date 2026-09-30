import { afterEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineRestoreScript } from "./helper";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const fixture = String.raw`
root = Path(sys.argv[1])
scenario = sys.argv[2]
data, secrets = root / "data", root / "secrets"
data.mkdir(mode=0o700)
secrets.mkdir(mode=0o700)
source_database, source_secret = root / "database", root / "secret"
db = sqlite3.connect(source_database)
db.execute("CREATE TABLE alembic_version(version_num TEXT)")
db.execute("INSERT INTO alembic_version VALUES ('fixture-head')")
db.execute("CREATE TABLE retained_job(id TEXT)")
db.execute("INSERT INTO retained_job VALUES ('original-job')")
db.commit()
db.close()
source_database.chmod(0o600)
source_secret.write_bytes(b"captured-secret-exact-bytes")
source_secret.chmod(0o600)
def captured(path):
    raw = path.read_bytes()
    return {"sha256": hashlib.sha256(raw).hexdigest(), "size": len(raw)}
intent = {"capture": {"database": captured(source_database), "secret": captured(source_secret),
          "revisions": ["fixture-head"], "tables": ["alembic_version", "retained_job"]}, "block": "original-block"}
intent_path = root / "intent"
intent_path.write_text(json.dumps(intent))
intent_path.chmod(0o600)
def invoke(mode="install"):
    return restore(mode, intent_path, data, secrets, source_database, source_secret, os.getuid(), os.getgid())
def refused(fragment):
    try:
        invoke()
    except (ValueError, OSError) as error:
        assert fragment in str(error), str(error)
    else:
        raise AssertionError("operation unexpectedly succeeded")
if scenario == "incomplete":
    (data / "config").mkdir(mode=0o700)
    (data / "config" / "langflow.db").write_bytes(b"partial")
    refused("incomplete")
elif scenario == "symlink":
    (secrets / "engine-secret").symlink_to(source_secret)
    refused("incomplete")
elif scenario == "source-changed":
    source_secret.write_bytes(b"changed source")
    refused("copy_conflict")
    assert not (data / ".trellis-restored-engine.json").exists()
    refused("incomplete")
else:
    first = invoke()
    assert (data / "config" / "langflow.db").read_bytes() == source_database.read_bytes()
    assert (secrets / "engine-secret").read_bytes() == source_secret.read_bytes()
    assert stat.S_IMODE((data / "config" / "langflow.db").stat().st_mode) == 0o600
    assert stat.S_IMODE((secrets / "engine-secret").stat().st_mode) == 0o400
    if scenario == "equal-replay":
        inode = (data / "config" / "langflow.db").stat().st_ino
        assert invoke() == first == invoke("verify")
        assert (data / "config" / "langflow.db").stat().st_ino == inode
    elif scenario == "secret-changed":
        (secrets / "engine-secret").chmod(0o600)
        (secrets / "engine-secret").write_bytes(b"changed destination")
        (secrets / "engine-secret").chmod(0o400)
        refused("destination_changed")
    elif scenario == "database-changed":
        with (data / "config" / "langflow.db").open("ab") as output:
            output.write(b"changed")
        refused("destination_changed")
    elif scenario == "mode-changed":
        (secrets / "engine-secret").chmod(0o600)
        refused("file_mode_conflict")
    elif scenario == "block-changed":
        intent["block"] = "another-block"
        intent_path.write_text(json.dumps(intent))
        refused("installation_conflict")
print("verified fixture " + scenario)
`;

for (const scenario of ["equal-replay", "secret-changed", "database-changed", "mode-changed", "block-changed", "incomplete", "symlink", "source-changed"]) {
	test(`the offline copy helper verifies ${scenario}`, async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "trellis-restored-engine-helper-")));
		roots.push(root);
		const child = Bun.spawn(["python3", "-", root, scenario], {
			stdin: new Blob([`__name__ = "fixture"\n${engineRestoreScript}\n${fixture}`]), stdout: "pipe", stderr: "pipe",
		});
		const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
		expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
		expect(stdout.trim()).toBe(`verified fixture ${scenario}`);
	});
}
