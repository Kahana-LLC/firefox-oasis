#!/usr/bin/env python3
import argparse
import json
import logging
import re
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

SCHEMA = """
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product TEXT NOT NULL,
  version TEXT NOT NULL,
  build_id TEXT NOT NULL,
  build_target TEXT NOT NULL,
  locale TEXT,
  mar_url TEXT NOT NULL,
  mar_size INTEGER NOT NULL,
  hash_function TEXT NOT NULL,
  hash_value TEXT NOT NULL,
  app_version TEXT NOT NULL,
  display_version TEXT NOT NULL,
  platform_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(product, version, build_target, locale)
);

CREATE TABLE IF NOT EXISTS ring_pointers (
  ring TEXT PRIMARY KEY,
  target_version TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ring_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ring TEXT NOT NULL,
  old_version TEXT,
  new_version TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
"""

RING_ALLOWLIST = {"oasis-canary", "oasis-stable"}
PRE_RELEASE_RANK = {"a": 0, "b": 1, "rc": 2, None: 3}


def init_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db_connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def parse_version(value: str):
    cleaned = value.strip().lower().replace("esr", "")
    match = re.match(r"^(\d+(?:\.\d+)*)(?:(a|b|rc)(\d+))?$", cleaned)
    if match:
        nums = [int(part) for part in match.group(1).split(".")]
        pre = match.group(2)
        pre_num = int(match.group(3)) if match.group(3) else 0
        return nums, pre, pre_num
    nums = [int(part) for part in re.findall(r"\d+", cleaned)]
    return nums, None, 0


def compare_versions(left: str, right: str) -> int:
    try:
        from packaging.version import Version

        lv = Version(left)
        rv = Version(right)
        return (lv > rv) - (lv < rv)
    except Exception:
        lnums, lpre, lpre_num = parse_version(left)
        rnums, rpre, rpre_num = parse_version(right)
        max_len = max(len(lnums), len(rnums))
        lnums.extend([0] * (max_len - len(lnums)))
        rnums.extend([0] * (max_len - len(rnums)))
        if lnums != rnums:
            return (lnums > rnums) - (lnums < rnums)
        lrank = PRE_RELEASE_RANK.get(lpre, 3)
        rrank = PRE_RELEASE_RANK.get(rpre, 3)
        if lrank != rrank:
            return (lrank > rrank) - (lrank < rrank)
        return (lpre_num > rpre_num) - (lpre_num < rpre_num)


def build_empty_updates_xml() -> bytes:
    updates = ET.Element("updates")
    body = ET.tostring(updates, encoding="utf-8")
    return b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + body


def build_update_xml(artifact: sqlite3.Row) -> bytes:
    updates = ET.Element("updates")
    update = ET.SubElement(updates, "update")
    update.set("type", "minor")
    update.set("displayVersion", artifact["display_version"])
    update.set("appVersion", artifact["app_version"])
    update.set("platformVersion", artifact["platform_version"])
    update.set("buildID", artifact["build_id"])

    patch = ET.SubElement(update, "patch")
    patch.set("type", "complete")
    patch.set("URL", artifact["mar_url"])
    patch.set("size", str(artifact["mar_size"]))
    patch.set("hashFunction", artifact["hash_function"])
    patch.set("hashValue", artifact["hash_value"])

    body = ET.tostring(updates, encoding="utf-8")
    return b"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + body


def parse_json(body: bytes):
    if not body:
        return None
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        return None


def normalize_locale(locale):
    if locale is None:
        return None
    value = str(locale).strip()
    if not value or value == "*":
        return None
    return value


def artifact_key(payload):
    return (
        payload["product"],
        payload["version"],
        payload["build_target"],
        normalize_locale(payload.get("locale")),
    )


def validate_artifact_payload(payload):
    required = [
        "product",
        "version",
        "build_id",
        "build_target",
        "mar_url",
        "mar_size",
        "hash_function",
        "hash_value",
    ]
    missing = [key for key in required if not payload.get(key)]
    if missing:
        return False, f"Missing fields: {', '.join(missing)}"
    version = str(payload["version"]).strip()
    mar_url = str(payload["mar_url"]).strip()
    if version not in mar_url:
        return False, "mar_url must include the version string"
    return True, ""


def upsert_artifact(conn: sqlite3.Connection, payload):
    key = artifact_key(payload)
    existing = conn.execute(
        """
        SELECT * FROM artifacts
        WHERE product = ? AND version = ? AND build_target = ? AND locale IS ?
        """,
        key,
    ).fetchone()
    normalized_locale = normalize_locale(payload.get("locale"))
    display_version = payload.get("display_version") or payload["version"]
    app_version = payload.get("app_version") or payload["version"]
    platform_version = payload.get("platform_version") or payload["version"]

    if existing:
        same = (
            existing["build_id"] == payload["build_id"]
            and existing["mar_url"] == payload["mar_url"]
            and existing["mar_size"] == int(payload["mar_size"])
            and existing["hash_function"] == payload["hash_function"]
            and existing["hash_value"] == payload["hash_value"]
            and existing["display_version"] == display_version
            and existing["app_version"] == app_version
            and existing["platform_version"] == platform_version
        )
        if not same:
            return None, "Artifact already exists and is immutable"
        return existing, None

    conn.execute(
        """
        INSERT INTO artifacts (
          product, version, build_id, build_target, locale,
          mar_url, mar_size, hash_function, hash_value,
          app_version, display_version, platform_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload["product"],
            payload["version"],
            payload["build_id"],
            payload["build_target"],
            normalized_locale,
            payload["mar_url"],
            int(payload["mar_size"]),
            payload["hash_function"],
            payload["hash_value"],
            app_version,
            display_version,
            platform_version,
        ),
    )
    conn.commit()
    return conn.execute(
        """
        SELECT * FROM artifacts
        WHERE product = ? AND version = ? AND build_target = ? AND locale IS ?
        """,
        key,
    ).fetchone(), None


def set_ring_pointer(conn: sqlite3.Connection, ring: str, target_version: str, actor: str, reason: str):
    now = conn.execute("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')").fetchone()[0]
    existing = conn.execute(
        "SELECT target_version FROM ring_pointers WHERE ring = ?",
        (ring,),
    ).fetchone()
    old_version = existing["target_version"] if existing else None

    conn.execute(
        """
        INSERT INTO ring_pointers (ring, target_version, updated_at, updated_by, reason)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(ring) DO UPDATE SET
          target_version = excluded.target_version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          reason = excluded.reason
        """,
        (ring, target_version, now, actor, reason),
    )
    conn.execute(
        """
        INSERT INTO ring_audit (ring, old_version, new_version, actor, reason, changed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (ring, old_version, target_version, actor, reason, now),
    )
    conn.commit()
    return old_version, now


class UpdateHandler(BaseHTTPRequestHandler):
    server_version = "OasisUpdateService/0.1"

    def log_message(self, format, *args):
        logging.info("%s - %s", self.address_string(), format % args)

    def send_bytes(self, status: int, body: bytes, content_type: str):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, payload: dict):
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def send_xml(self, status: int, body: bytes):
        self.send_bytes(status, body, "text/xml; charset=utf-8")

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith("/update/6/") and path.endswith("/update.xml"):
            return self.handle_update(path)
        if path == "/admin/rings":
            return self.handle_list_rings()
        if path.startswith("/admin/rings/"):
            return self.handle_get_ring(path)
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/admin/artifacts":
            return self.handle_post_artifact()
        if path.startswith("/admin/rings/"):
            return self.handle_set_ring(path)
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def handle_update(self, path: str):
        segments = path.split("/")
        params = segments[3:-1]
        if len(params) != 10:
            return self.send_xml(HTTPStatus.OK, build_empty_updates_xml())
        (
            product,
            version,
            build_id,
            build_target,
            locale,
            channel,
            os_version,
            system_capabilities,
            distribution,
            distribution_version,
        ) = [unquote(part) for part in params]

        ring = channel
        if ring not in RING_ALLOWLIST:
            return self.send_xml(HTTPStatus.OK, build_empty_updates_xml())

        conn = db_connect(self.server.db_path)
        try:
            ring_row = conn.execute(
                "SELECT target_version FROM ring_pointers WHERE ring = ?",
                (ring,),
            ).fetchone()
            if not ring_row:
                return self.send_xml(HTTPStatus.OK, build_empty_updates_xml())
            target_version = ring_row["target_version"]
            if compare_versions(target_version, version) <= 0:
                return self.send_xml(HTTPStatus.OK, build_empty_updates_xml())

            artifact = conn.execute(
                """
                SELECT * FROM artifacts
                WHERE product = ? AND version = ? AND build_target = ? AND locale = ?
                """,
                (product, target_version, build_target, locale),
            ).fetchone()
            if not artifact:
                artifact = conn.execute(
                    """
                    SELECT * FROM artifacts
                    WHERE product = ? AND version = ? AND build_target = ? AND locale IS NULL
                    """,
                    (product, target_version, build_target),
                ).fetchone()
            if not artifact:
                return self.send_xml(HTTPStatus.OK, build_empty_updates_xml())

            body = build_update_xml(artifact)
            return self.send_xml(HTTPStatus.OK, body)
        finally:
            conn.close()

    def handle_post_artifact(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        payload = parse_json(body)
        if payload is None:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid json"})

        ok, error = validate_artifact_payload(payload)
        if not ok:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": error})

        conn = db_connect(self.server.db_path)
        try:
            artifact, err = upsert_artifact(conn, payload)
            if err:
                return self.send_json(HTTPStatus.CONFLICT, {"error": err})
            return self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "artifact": {
                        "product": artifact["product"],
                        "version": artifact["version"],
                        "build_id": artifact["build_id"],
                        "build_target": artifact["build_target"],
                        "locale": artifact["locale"],
                        "mar_url": artifact["mar_url"],
                        "mar_size": artifact["mar_size"],
                        "hash_function": artifact["hash_function"],
                        "hash_value": artifact["hash_value"],
                        "display_version": artifact["display_version"],
                        "app_version": artifact["app_version"],
                        "platform_version": artifact["platform_version"],
                    },
                },
            )
        finally:
            conn.close()

    def handle_set_ring(self, path: str):
        ring = path[len("/admin/rings/") :].strip("/")
        if not ring:
            return self.send_json(HTTPStatus.NOT_FOUND, {"error": "ring missing"})
        if ring not in RING_ALLOWLIST:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "ring not allowed"})

        length = int(self.headers.get("Content-Length", "0"))
        payload = parse_json(self.rfile.read(length))
        if payload is None:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "invalid json"})

        target_version = payload.get("target_version")
        actor = payload.get("actor")
        reason = payload.get("reason")
        if not target_version or not actor or not reason:
            return self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": "target_version, actor, and reason are required"},
            )

        conn = db_connect(self.server.db_path)
        try:
            old_version, updated_at = set_ring_pointer(
                conn, ring, target_version, actor, reason
            )
            return self.send_json(
                HTTPStatus.OK,
                {
                    "status": "ok",
                    "ring": ring,
                    "old_version": old_version,
                    "new_version": target_version,
                    "updated_at": updated_at,
                },
            )
        finally:
            conn.close()

    def handle_list_rings(self):
        conn = db_connect(self.server.db_path)
        try:
            rows = conn.execute(
                "SELECT ring, target_version, updated_at, updated_by, reason FROM ring_pointers"
            ).fetchall()
            payload = [
                {
                    "ring": row["ring"],
                    "target_version": row["target_version"],
                    "updated_at": row["updated_at"],
                    "updated_by": row["updated_by"],
                    "reason": row["reason"],
                }
                for row in rows
            ]
            return self.send_json(HTTPStatus.OK, {"rings": payload})
        finally:
            conn.close()

    def handle_get_ring(self, path: str):
        remainder = path[len("/admin/rings/") :].strip("/")
        if remainder.endswith("/audit"):
            ring = remainder[: -len("/audit")].strip("/")
            return self.handle_ring_audit(ring)

        ring = remainder
        if ring not in RING_ALLOWLIST:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "ring not allowed"})

        conn = db_connect(self.server.db_path)
        try:
            row = conn.execute(
                "SELECT ring, target_version, updated_at, updated_by, reason FROM ring_pointers WHERE ring = ?",
                (ring,),
            ).fetchone()
            if not row:
                return self.send_json(HTTPStatus.NOT_FOUND, {"error": "ring not set"})
            return self.send_json(
                HTTPStatus.OK,
                {
                    "ring": row["ring"],
                    "target_version": row["target_version"],
                    "updated_at": row["updated_at"],
                    "updated_by": row["updated_by"],
                    "reason": row["reason"],
                },
            )
        finally:
            conn.close()

    def handle_ring_audit(self, ring: str):
        if ring not in RING_ALLOWLIST:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": "ring not allowed"})

        conn = db_connect(self.server.db_path)
        try:
            rows = conn.execute(
                """
                SELECT id, ring, old_version, new_version, actor, reason, changed_at
                FROM ring_audit
                WHERE ring = ?
                ORDER BY id DESC
                LIMIT 200
                """,
                (ring,),
            ).fetchall()
            payload = [
                {
                    "id": row["id"],
                    "ring": row["ring"],
                    "old_version": row["old_version"],
                    "new_version": row["new_version"],
                    "actor": row["actor"],
                    "reason": row["reason"],
                    "changed_at": row["changed_at"],
                }
                for row in rows
            ]
            return self.send_json(HTTPStatus.OK, {"audit": payload})
        finally:
            conn.close()


def main():
    parser = argparse.ArgumentParser(description="Oasis update metadata service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument(
        "--db",
        default="tools/oasis-update-service/metadata.db",
        help="Path to sqlite database",
    )
    args = parser.parse_args()

    init_db(args.db)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")

    server = ThreadingHTTPServer((args.host, args.port), UpdateHandler)
    server.db_path = args.db
    logging.info("listening on %s:%s", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
