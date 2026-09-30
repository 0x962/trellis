export const engineRestoreScript = String.raw`import hashlib
import json
import os
import sqlite3
import stat
import sys
from pathlib import Path


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def file_facts(path, uid, gid, mode):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise ValueError("restored_engine_file_unsafe")
        if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (uid, gid, mode):
            raise ValueError("restored_engine_file_mode_conflict")
        digest = hashlib.sha256()
        size = 0
        while chunk := os.read(fd, 1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
        return {"sha256": digest.hexdigest(), "size": size, "uid": uid, "gid": gid, "mode": f"{mode:04o}"}
    finally:
        os.close(fd)


def directory(path, uid, gid):
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (uid, gid, 0o700):
        raise ValueError("restored_engine_directory_conflict")


def copy_exact(source, destination, expected, uid, gid, mode):
    source_fd = os.open(source, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(source_fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or stat.S_IMODE(info.st_mode) & 0o077:
            raise ValueError("restored_engine_source_unsafe")
        target_fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        try:
            digest = hashlib.sha256()
            size = 0
            while chunk := os.read(source_fd, 1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
                view = memoryview(chunk)
                while view:
                    written = os.write(target_fd, view)
                    view = view[written:]
            if {"sha256": digest.hexdigest(), "size": size} != expected:
                raise ValueError("restored_engine_copy_conflict")
            os.fchown(target_fd, uid, gid)
            os.fchmod(target_fd, mode)
            os.fsync(target_fd)
        finally:
            os.close(target_fd)
    finally:
        os.close(source_fd)


def verify_files(data, secrets, intent, uid, gid):
    for path in (data, data / "config", secrets):
        directory(path, uid, gid)
    if set(item.name for item in data.iterdir()) - {"config", ".trellis-restored-engine.json"}:
        raise ValueError("restored_engine_data_extra")
    if set(item.name for item in (data / "config").iterdir()) != {"langflow.db"}:
        raise ValueError("restored_engine_database_extra")
    if set(item.name for item in secrets.iterdir()) != {"engine-secret"}:
        raise ValueError("restored_engine_secret_extra")
    database = file_facts(data / "config" / "langflow.db", uid, gid, 0o600)
    secret = file_facts(secrets / "engine-secret", uid, gid, 0o400)
    for actual, expected in ((database, intent["capture"]["database"]), (secret, intent["capture"]["secret"])):
        if {"sha256": actual["sha256"], "size": actual["size"]} != expected:
            raise ValueError("restored_engine_destination_changed")
    connection = sqlite3.connect((data / "config" / "langflow.db").as_uri() + "?mode=ro&immutable=1", uri=True)
    try:
        if connection.execute("PRAGMA quick_check").fetchall() != [("ok",)]:
            raise ValueError("restored_engine_database_invalid")
        revisions = sorted(row[0] for row in connection.execute("SELECT version_num FROM alembic_version"))
        tables = sorted(row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'"))
    finally:
        connection.close()
    if revisions != intent["capture"]["revisions"] or tables != intent["capture"]["tables"]:
        raise ValueError("restored_engine_schema_conflict")
    return {"database": database, "secret": secret, "revisions": revisions, "tables": tables}


def restore(mode, intent_path, data, secrets, source_database, source_secret, uid=10001, gid=10001):
    if mode not in ("install", "verify"):
        raise ValueError("restored_engine_operation_invalid")
    intent_bytes = intent_path.read_bytes()
    intent = json.loads(intent_bytes)
    for path in (data, secrets):
        if not stat.S_ISDIR(path.lstat().st_mode):
            raise ValueError("restored_engine_volume_unsafe")
    marker = data / ".trellis-restored-engine.json"
    if os.path.lexists(marker):
        file_facts(marker, uid, gid, 0o600)
        if marker.read_bytes() != intent_bytes:
            raise ValueError("restored_engine_installation_conflict")
    else:
        if mode == "verify" or any(data.iterdir()) or any(secrets.iterdir()):
            raise ValueError("restored_engine_installation_incomplete")
        for path in (data, secrets):
            if not stat.S_ISDIR(path.lstat().st_mode):
                raise ValueError("restored_engine_volume_unsafe")
            os.chown(path, uid, gid)
            os.chmod(path, 0o700)
        (data / "config").mkdir(mode=0o700)
        os.chown(data / "config", uid, gid)
        copy_exact(source_database, data / "config" / "langflow.db", intent["capture"]["database"], uid, gid, 0o600)
        copy_exact(source_secret, secrets / "engine-secret", intent["capture"]["secret"], uid, gid, 0o400)
        verify_files(data, secrets, intent, uid, gid)
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "wb", closefd=False) as output:
                output.write(intent_bytes)
                output.flush()
                os.fchown(fd, uid, gid)
                os.fchmod(fd, 0o600)
                os.fsync(fd)
        finally:
            os.close(fd)
        for path in (data / "config", data, secrets):
            sync_directory(path)
    facts = verify_files(data, secrets, intent, uid, gid)
    return {"version": 1, "intentDigest": hashlib.sha256(intent_bytes).hexdigest(), **facts}


if __name__ == "__main__":
    result = restore(sys.argv[1], Path("/input/intent"), Path("/data"), Path("/run/trellis-secrets"),
                     Path("/input/database"), Path("/input/secret"))
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
`;
