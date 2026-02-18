#!/usr/bin/env python3
"""Create or update a backend Cloud Build GitHub trigger from a vars file."""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse


SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[2]
DEFAULT_VARS_FILE = SCRIPT_PATH.with_name("cloudbuild.trigger.vars.example")


def run(
    cmd: list[str],
    *,
    dry_run: bool = False,
    capture_output: bool = False,
) -> str:
    log_cmd = list(cmd)
    for secret_flag in ("--substitutions", "--update-substitutions"):
        if secret_flag in log_cmd:
            idx = log_cmd.index(secret_flag)
            if idx + 1 < len(log_cmd):
                log_cmd[idx + 1] = "<redacted>"
    print(f"+ {shlex.join(log_cmd)}")
    if dry_run:
        return ""

    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        text=True,
        capture_output=capture_output,
        check=False,
    )
    if result.returncode != 0:
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        raise SystemExit(result.returncode)

    if capture_output:
        return result.stdout.strip()
    return ""


def get_git_origin() -> str:
    return run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True,
    ).strip()


def parse_github_remote(origin: str) -> tuple[str, str]:
    if origin.startswith("git@"):
        host_and_repo = origin.split("@", 1)[1]
        host, repo_path = host_and_repo.split(":", 1)
    else:
        parsed = urlparse(origin)
        host = parsed.hostname or ""
        repo_path = parsed.path.lstrip("/")

    if host.lower() != "github.com":
        raise SystemExit(
            f"Only github.com remotes are supported by this helper. Found: {origin}"
        )

    if repo_path.endswith(".git"):
        repo_path = repo_path[:-4]
    parts = [p for p in repo_path.split("/") if p]
    if len(parts) < 2:
        raise SystemExit(f"Could not parse owner/repo from remote: {origin}")
    return parts[0], parts[1]


def parse_vars_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SystemExit(f"Vars file not found: {path}")

    values: dict[str, str] = {}
    for i, raw_line in enumerate(path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"Invalid line {i} in {path}: {raw_line}")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        # Allow both Cloud Build substitution keys (_KEY=value) and regular env
        # keys (KEY=value). PORT maps to _API_PORT for cloudbuild.yaml.
        if not key.startswith("_"):
            if key == "PORT":
                key = "_API_PORT"
            else:
                key = f"_{key}"

        values[key] = value
    return values


def contains_placeholders(values: dict[str, str]) -> list[str]:
    placeholder_fragments = (
        "replace_me",
        "replace-me",
        "replace-with-trigger-id",
        "your-app.run.app",
    )
    bad: list[str] = []
    for key, value in values.items():
        if key == "_TRIGGER_ID":
            continue
        if any(fragment in value for fragment in placeholder_fragments):
            bad.append(key)
    return bad


def to_substitutions_arg(values: dict[str, str]) -> str:
    return ",".join(f"{k}={v}" for k, v in sorted(values.items()))


def resolve_api_base_url(
    *,
    values: dict[str, str],
    region: str,
    gcloud_prefix: list[str],
    api_base_url_override: str | None,
    dry_run: bool,
) -> str:
    if api_base_url_override:
        return api_base_url_override

    configured = values.get("_API_BASE_URL", "").strip()
    if configured and "replace" not in configured:
        return configured

    service_name = values.get("_SERVICE_NAME", "").strip()
    if not service_name:
        raise SystemExit(
            "_SERVICE_NAME must be set to auto-resolve _API_BASE_URL."
        )

    cmd = (
        gcloud_prefix
        + [
            "run",
            "services",
            "describe",
            service_name,
            "--region",
            region,
            "--format=value(status.url)",
        ]
    )
    print(f"+ {shlex.join(cmd)}")

    if dry_run:
        return f"https://{service_name}.a.run.app"

    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        url = result.stdout.strip()
        if url:
            return url

    if configured:
        return configured

    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    raise SystemExit(
        "Could not auto-resolve _API_BASE_URL from Cloud Run. "
        "Set _API_BASE_URL in the vars file or pass --api-base-url."
    )


def find_trigger_id(
    name: str,
    region: str,
    gcloud_prefix: list[str],
    *,
    dry_run: bool = False,
) -> str | None:
    raw = run(
        gcloud_prefix
        + ["builds", "triggers", "list", "--region", region, "--format=json"],
        dry_run=dry_run,
        capture_output=True,
    )
    if dry_run:
        return None
    items = json.loads(raw or "[]")
    for item in items:
        if item.get("name") == name:
            return item.get("id")
    return None


def create_trigger(
    *,
    name: str,
    description: str,
    region: str,
    owner: str,
    repo: str,
    branch_pattern: str,
    build_config: str,
    included_files: str,
    ignored_files: str,
    substitutions: dict[str, str],
    service_account: str | None,
    gcloud_prefix: list[str],
    dry_run: bool,
) -> str | None:
    cmd = gcloud_prefix + [
            "builds",
            "triggers",
            "create",
            "github",
            "--name",
            name,
            "--description",
            description,
            "--region",
            region,
            "--repo-owner",
            owner,
            "--repo-name",
            repo,
            "--branch-pattern",
            branch_pattern,
            "--build-config",
            build_config,
            "--included-files",
            included_files,
            "--ignored-files",
            ignored_files,
            "--include-logs-with-status",
            "--substitutions",
            to_substitutions_arg(substitutions),
            "--format=json",
        ]
    if service_account:
        cmd.extend(["--service-account", service_account])
    raw = run(cmd, dry_run=dry_run, capture_output=True)
    if dry_run:
        return None
    try:
        created = json.loads(raw)
        return created.get("id")
    except json.JSONDecodeError:
        return None


def update_trigger(
    *,
    trigger_id: str,
    description: str,
    region: str,
    owner: str,
    repo: str,
    branch_pattern: str,
    build_config: str,
    included_files: str,
    ignored_files: str,
    substitutions: dict[str, str],
    service_account: str | None,
    gcloud_prefix: list[str],
    dry_run: bool,
) -> None:
    cmd = gcloud_prefix + [
            "builds",
            "triggers",
            "update",
            "github",
            trigger_id,
            "--region",
            region,
            "--description",
            description,
            "--repo-owner",
            owner,
            "--repo-name",
            repo,
            "--branch-pattern",
            branch_pattern,
            "--build-config",
            build_config,
            "--included-files",
            included_files,
            "--ignored-files",
            ignored_files,
            "--include-logs-with-status",
            "--update-substitutions",
            to_substitutions_arg(substitutions),
        ]
    if service_account:
        cmd.extend(["--service-account", service_account])
    run(cmd, dry_run=dry_run)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Create or update a backend Cloud Build trigger using substitutions "
            "from a vars file."
        )
    )
    parser.add_argument(
        "--vars-file",
        default=str(DEFAULT_VARS_FILE),
        help=f"Path to _KEY=value substitutions file (default: {DEFAULT_VARS_FILE})",
    )
    parser.add_argument("--project", help="GCP project id (optional).")
    parser.add_argument("--name", help="Trigger name (default: backend-<repo>).")
    parser.add_argument("--description", help="Trigger description override.")
    parser.add_argument(
        "--repo-owner",
        help="GitHub repo owner override (default: inferred from git remote origin).",
    )
    parser.add_argument(
        "--repo-name",
        help="GitHub repo name override (default: inferred from git remote origin).",
    )
    branch_group = parser.add_mutually_exclusive_group()
    branch_group.add_argument(
        "--branch",
        help="Branch name to match exactly (converted to ^<branch>$).",
    )
    branch_group.add_argument(
        "--branch-regex",
        help="Branch regex to use directly (otherwise read from vars file).",
    )
    parser.add_argument(
        "--api-base-url",
        help="Override API base URL (otherwise auto-resolved from Cloud Run service URL).",
    )
    parser.add_argument(
        "--trigger-region",
        help="Cloud Build trigger location (otherwise read from vars file).",
    )
    parser.add_argument(
        "--service-account",
        help=(
            "Trigger service account (projects/<project>/serviceAccounts/<email>). "
            "Use this if your org blocks default Cloud Build SA."
        ),
    )
    parser.add_argument("--build-config", help="Build config path override.")
    parser.add_argument("--included-files")
    parser.add_argument("--ignored-files")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands only; do not call gcloud.",
    )

    args = parser.parse_args()

    values = parse_vars_file(Path(args.vars_file))
    trigger_name_from_vars = values.pop("_TRIGGER_NAME", "").strip()
    repo_name_from_vars = values.pop("_REPO_NAME", "").strip()
    repo_owner_from_vars = values.pop("_REPO_OWNER", "").strip()
    build_config_from_vars = values.pop("_BUILD_CONFIG", "").strip()
    branch_regex_from_vars = values.pop("_PUSH_BRANCH_REGEX", "").strip()
    trigger_region_from_vars = values.pop("_TRIGGER_REGION", "").strip()
    included_files_from_vars = values.pop("_TRIGGER_INCLUDED_FILES", "").strip()
    ignored_files_from_vars = values.pop("_TRIGGER_IGNORED_FILES", "").strip()

    if bool(args.repo_owner) != bool(args.repo_name):
        raise SystemExit("Pass both --repo-owner and --repo-name together.")

    if args.repo_owner and args.repo_name:
        owner, repo = args.repo_owner, args.repo_name
    else:
        origin = get_git_origin()
        owner_from_git, repo_from_git = parse_github_remote(origin)
        owner = repo_owner_from_vars or owner_from_git
        repo = repo_name_from_vars or repo_from_git

    if args.branch:
        branch_pattern = f"^{re.escape(args.branch)}$"
        branch_label = args.branch
    elif args.branch_regex:
        branch_pattern = args.branch_regex
        branch_label = args.branch_regex
    elif branch_regex_from_vars:
        branch_pattern = branch_regex_from_vars
        branch_label = branch_regex_from_vars
    else:
        raise SystemExit(
            "Missing push branch regex. Set PUSH_BRANCH_REGEX in vars file "
            "or pass --branch/--branch-regex."
        )

    trigger_name = args.name or trigger_name_from_vars or f"backend-{repo}"
    description = (
        args.description
        or f"Backend deploy trigger for {owner}/{repo} ({branch_pattern})"
    )
    deploy_region = values.get("_DEPLOY_REGION", "us-central1")
    trigger_region = args.trigger_region or trigger_region_from_vars
    if not trigger_region:
        raise SystemExit(
            "Missing trigger region. Set TRIGGER_REGION in vars file "
            "or pass --trigger-region."
        )
    build_config = args.build_config or build_config_from_vars
    if not build_config:
        raise SystemExit(
            "Missing build config path. Set BUILD_CONFIG in vars file "
            "or pass --build-config."
        )
    included_files = (
        args.included_files or included_files_from_vars
    )
    if not included_files:
        raise SystemExit(
            "Missing trigger included files. Set TRIGGER_INCLUDED_FILES in vars "
            "file or pass --included-files."
        )
    ignored_files = (
        args.ignored_files or ignored_files_from_vars
    )
    if not ignored_files:
        raise SystemExit(
            "Missing trigger ignored files. Set TRIGGER_IGNORED_FILES in vars "
            "file or pass --ignored-files."
        )

    gcloud_prefix = ["gcloud"]
    if args.project:
        gcloud_prefix += ["--project", args.project]

    values["_API_BASE_URL"] = resolve_api_base_url(
        values=values,
        region=deploy_region,
        gcloud_prefix=gcloud_prefix,
        api_base_url_override=args.api_base_url,
        dry_run=args.dry_run,
    )

    placeholder_keys = contains_placeholders(values)
    if placeholder_keys and not args.dry_run:
        joined = ", ".join(sorted(placeholder_keys))
        raise SystemExit(
            f"Vars file still contains placeholder values for: {joined}. "
            "Fill real values or run with --dry-run."
        )

    existing_trigger_id = find_trigger_id(
        trigger_name,
        trigger_region,
        gcloud_prefix,
        dry_run=args.dry_run,
    )

    if existing_trigger_id:
        values["_TRIGGER_ID"] = existing_trigger_id
        update_trigger(
            trigger_id=existing_trigger_id,
            description=description,
            region=trigger_region,
            owner=owner,
            repo=repo,
            branch_pattern=branch_pattern,
            build_config=build_config,
            included_files=included_files,
            ignored_files=ignored_files,
            substitutions=values,
            service_account=args.service_account,
            gcloud_prefix=gcloud_prefix,
            dry_run=args.dry_run,
        )
        print(
            f"Updated trigger '{trigger_name}' ({existing_trigger_id}) for "
            f"{owner}/{repo} branch pattern '{branch_pattern}'."
        )
        return

    create_values = dict(values)
    create_values["_TRIGGER_ID"] = "pending"
    new_trigger_id = create_trigger(
        name=trigger_name,
        description=description,
        region=trigger_region,
        owner=owner,
        repo=repo,
        branch_pattern=branch_pattern,
        build_config=build_config,
        included_files=included_files,
        ignored_files=ignored_files,
        substitutions=create_values,
        service_account=args.service_account,
        gcloud_prefix=gcloud_prefix,
        dry_run=args.dry_run,
    )

    if args.dry_run:
        print(
            f"Dry run complete for trigger '{trigger_name}' on {owner}/{repo} "
            f"branch pattern '{branch_label}'."
        )
        return

    if not new_trigger_id:
        new_trigger_id = find_trigger_id(trigger_name, trigger_region, gcloud_prefix)
    if not new_trigger_id:
        raise SystemExit("Trigger was created, but ID could not be resolved.")

    values["_TRIGGER_ID"] = new_trigger_id
    update_trigger(
        trigger_id=new_trigger_id,
        description=description,
        region=trigger_region,
        owner=owner,
        repo=repo,
        branch_pattern=branch_pattern,
        build_config=build_config,
        included_files=included_files,
        ignored_files=ignored_files,
        substitutions=values,
        service_account=args.service_account,
        gcloud_prefix=gcloud_prefix,
        dry_run=False,
    )
    print(
        f"Created trigger '{trigger_name}' ({new_trigger_id}) for {owner}/{repo} "
        f"branch pattern '{branch_pattern}'."
    )


if __name__ == "__main__":
    main()
