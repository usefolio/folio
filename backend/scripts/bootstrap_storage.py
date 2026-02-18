#!/usr/bin/env python3
"""Bootstrap private GCS storage prerequisites for Cloud Build trigger vars."""

from __future__ import annotations

import argparse
import base64
import json
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]


def run(
    cmd: list[str],
    *,
    capture_output: bool = False,
    check: bool = True,
) -> str:
    print(f"+ {shlex.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        text=True,
        capture_output=capture_output,
        check=False,
    )
    if check and result.returncode != 0:
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        raise SystemExit(result.returncode)

    if capture_output:
        return result.stdout.strip()
    return ""


def command_succeeds(cmd: list[str]) -> bool:
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def ensure_private_bucket(
    *,
    bucket_name: str,
    location: str,
    gcloud_prefix: list[str],
) -> None:
    bucket_uri = f"gs://{bucket_name}"
    describe_cmd = gcloud_prefix + ["storage", "buckets", "describe", bucket_uri]

    if command_succeeds(describe_cmd):
        print(f"Bucket {bucket_uri} already exists.")
    else:
        run(
            gcloud_prefix
            + [
                "storage",
                "buckets",
                "create",
                bucket_uri,
                "--location",
                location,
                "--uniform-bucket-level-access",
                "--public-access-prevention=enforced",
            ]
        )

    # Ensure the bucket remains private even if it already existed.
    run(
        gcloud_prefix
        + [
            "storage",
            "buckets",
            "update",
            bucket_uri,
            "--uniform-bucket-level-access",
        ]
    )
    run(
        gcloud_prefix
        + [
            "storage",
            "buckets",
            "update",
            bucket_uri,
            "--public-access-prevention=enforced",
        ]
    )


def ensure_service_account(
    *,
    project: str,
    service_account_id: str,
    service_account_display_name: str,
    gcloud_prefix: list[str],
) -> str:
    email = f"{service_account_id}@{project}.iam.gserviceaccount.com"
    describe_cmd = gcloud_prefix + ["iam", "service-accounts", "describe", email]
    if command_succeeds(describe_cmd):
        print(f"Service account {email} already exists.")
        return email

    run(
        gcloud_prefix
        + [
            "iam",
            "service-accounts",
            "create",
            service_account_id,
            "--display-name",
            service_account_display_name,
        ]
    )
    return email


def grant_bucket_permissions(
    *,
    bucket_name: str,
    service_account_email: str,
    gcloud_prefix: list[str],
) -> None:
    bucket_uri = f"gs://{bucket_name}"
    roles = (
        "roles/storage.objectAdmin",
        "roles/storage.legacyBucketReader",
    )
    member = f"serviceAccount:{service_account_email}"
    for role in roles:
        run(
            gcloud_prefix
            + [
                "storage",
                "buckets",
                "add-iam-policy-binding",
                bucket_uri,
                "--member",
                member,
                "--role",
                role,
            ]
        )


def create_hmac_key(
    *,
    service_account_email: str,
    gcloud_prefix: list[str],
) -> tuple[str, str]:
    raw = run(
        gcloud_prefix
        + [
            "storage",
            "hmac",
            "create",
            service_account_email,
            "--format=json",
        ],
        capture_output=True,
    )
    payload = json.loads(raw)
    metadata = payload.get("metadata", {})
    access_id = metadata.get("accessId", "")
    secret = payload.get("secret", "")
    if not access_id or not secret:
        raise SystemExit(
            "Failed to create HMAC key: gcloud did not return accessId/secret."
        )
    return access_id, secret


def create_service_account_key_base64(
    *,
    service_account_email: str,
    gcloud_prefix: list[str],
) -> tuple[str, str]:
    with tempfile.NamedTemporaryFile(
        prefix="folio-storage-key-",
        suffix=".json",
        delete=False,
    ) as tmp:
        key_path = Path(tmp.name)

    try:
        run(
            gcloud_prefix
            + [
                "iam",
                "service-accounts",
                "keys",
                "create",
                str(key_path),
                "--iam-account",
                service_account_email,
            ]
        )
        key_bytes = key_path.read_bytes()
        key_info = json.loads(key_bytes.decode("utf-8"))
        key_id = key_info.get("private_key_id", "")
        encoded = base64.b64encode(key_bytes).decode("ascii")
        return encoded, key_id
    finally:
        key_path.unlink(missing_ok=True)


def update_vars_file(path: Path, updates: dict[str, str]) -> None:
    if path.exists():
        lines = path.read_text().splitlines()
    else:
        lines = []

    found: set[str] = set()
    rewritten: list[str] = []

    for line in lines:
        if "=" not in line:
            rewritten.append(line)
            continue
        key, _ = line.split("=", 1)
        key = key.strip()
        if key in updates:
            rewritten.append(f"{key}={updates[key]}")
            found.add(key)
        else:
            rewritten.append(line)

    for key, value in updates.items():
        if key not in found:
            rewritten.append(f"{key}={value}")

    path.write_text("\n".join(rewritten) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Create/update the private GCS bucket + credentials needed by "
            "backend/scripts/cloudbuild.trigger.vars.example."
        )
    )
    parser.add_argument("--project", required=True, help="GCP project id.")
    parser.add_argument("--bucket", required=True, help="GCS bucket name.")
    parser.add_argument(
        "--location",
        default="us-central1",
        help="Bucket location (default: us-central1).",
    )
    parser.add_argument(
        "--service-account-id",
        default="folio-storage-bucket-admin",
        help="Service account id to create/use.",
    )
    parser.add_argument(
        "--service-account-display-name",
        default="Folio Storage Bucket Admin",
        help="Display name for created service account.",
    )
    parser.add_argument(
        "--vars-file",
        help=(
            "Optional vars file path to auto-write "
            "_BUCKET_NAME/_GOOGLE_ACCESS_KEY_ID/_GOOGLE_ACCESS_KEY_SECRET/"
            "_GOOGLE_SERVICE_ACCOUNT_JSON."
        ),
    )
    args = parser.parse_args()

    gcloud_prefix = ["gcloud", "--project", args.project]

    ensure_private_bucket(
        bucket_name=args.bucket,
        location=args.location,
        gcloud_prefix=gcloud_prefix,
    )
    service_account_email = ensure_service_account(
        project=args.project,
        service_account_id=args.service_account_id,
        service_account_display_name=args.service_account_display_name,
        gcloud_prefix=gcloud_prefix,
    )
    grant_bucket_permissions(
        bucket_name=args.bucket,
        service_account_email=service_account_email,
        gcloud_prefix=gcloud_prefix,
    )

    access_key_id, access_key_secret = create_hmac_key(
        service_account_email=service_account_email,
        gcloud_prefix=gcloud_prefix,
    )
    service_account_json_b64, private_key_id = create_service_account_key_base64(
        service_account_email=service_account_email,
        gcloud_prefix=gcloud_prefix,
    )

    updates = {
        "_BUCKET_NAME": args.bucket,
        "_GOOGLE_ACCESS_KEY_ID": access_key_id,
        "_GOOGLE_ACCESS_KEY_SECRET": access_key_secret,
        "_GOOGLE_SERVICE_ACCOUNT_JSON": service_account_json_b64,
    }

    if args.vars_file:
        vars_path = Path(args.vars_file).expanduser().resolve()
        update_vars_file(vars_path, updates)
        print(f"Updated vars file: {vars_path}")

    print("\nStorage bootstrap complete. Use these substitutions:")
    for key in (
        "_BUCKET_NAME",
        "_GOOGLE_ACCESS_KEY_ID",
        "_GOOGLE_ACCESS_KEY_SECRET",
        "_GOOGLE_SERVICE_ACCOUNT_JSON",
    ):
        print(f"{key}={updates[key]}")

    print("\nNotes:")
    print("- Bucket privacy is enforced (UBLA + Public Access Prevention=enforced).")
    print("- _GOOGLE_SERVICE_ACCOUNT_JSON is base64-encoded service account JSON.")
    print("- Save _GOOGLE_ACCESS_KEY_SECRET now; GCS does not let you fetch it later.")
    if private_key_id:
        print(f"- Created service account key id: {private_key_id}")


if __name__ == "__main__":
    main()
