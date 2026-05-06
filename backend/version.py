"""Runtime build/version metadata for AetherWeave.

The production container receives these values through Docker build args.
For local development, we fall back to reading the repository metadata when
the .git directory is available.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return None


def _read_frontend_version() -> str:
    package_json = ROOT / "frontend" / "package.json"
    try:
        return json.loads(package_json.read_text(encoding="utf-8")).get("version", "1.0.0")
    except (OSError, json.JSONDecodeError):
        return "1.0.0"


def _git_branch_from_head() -> str:
    head = _read_text(ROOT / ".git" / "HEAD")
    if not head:
        return "unknown"
    if head.startswith("ref: "):
        return head.split("/")[-1]
    return "detached"


def _git_commit_from_head() -> str:
    head = _read_text(ROOT / ".git" / "HEAD")
    if not head:
        return "unknown"
    if head.startswith("ref: "):
        ref_path = ROOT / ".git" / head.replace("ref: ", "")
        commit = _read_text(ref_path)
        return commit[:12] if commit else "unknown"
    return head[:12]


def get_build_info() -> dict[str, str]:
    """Return a stable mapping between the running service and source repo."""
    git_commit = os.environ.get("GIT_COMMIT") or os.environ.get("VCS_REF") or _git_commit_from_head()
    git_branch = os.environ.get("GIT_BRANCH") or os.environ.get("VCS_BRANCH") or _git_branch_from_head()
    app_version = os.environ.get("APP_VERSION") or _read_frontend_version()

    return {
        "app_version": app_version,
        "git_commit": git_commit,
        "git_branch": git_branch,
        "build_time": os.environ.get("BUILD_TIME", "unknown"),
        "release_channel": os.environ.get("RELEASE_CHANNEL", "local"),
    }
