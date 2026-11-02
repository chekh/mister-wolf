#!/usr/bin/env python3
# wolf:rendered base=workflow-helper.py set=2.25.1
"""Local technical operations for an assigned task; never dispatches or accepts a task."""
import argparse
import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def git(root, *args):
    run = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True)
    if run.returncode:
        raise ValueError("git " + " ".join(args) + ": " + run.stderr.strip()[:400])
    return run.stdout.strip()


def identity(root):
    root = Path(root).resolve()
    actual = Path(git(root, "rev-parse", "--show-toplevel")).resolve()
    if actual != root:
        raise ValueError("repo must identify the worktree root")
    return root, git(root, "rev-parse", "HEAD"), git(root, "status", "--porcelain")


def publish(path, text):
    target = Path(path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_text() == text:
            return str(target)
        raise ValueError("output exists with different content; choose a new path")
    fd, temp = tempfile.mkstemp(dir=target.parent, prefix=".wolf-evidence-")
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(text)
        # A hard link publishes without overwriting a concurrent writer.
        os.link(temp, target)
    except FileExistsError:
        if target.read_text() != text:
            raise ValueError("output was concurrently created with different content")
    finally:
        os.unlink(temp)
    return str(target)


def task_pack(args):
    value = json.loads(Path(args.input).read_text())
    if not isinstance(value, dict):
        raise ValueError("input must be an object")
    required = ("task_id", "role", "goal", "ac", "scope", "inputs", "method", "verification", "execution", "expected_result")
    missing = [key for key in required if not value.get(key)]
    if not isinstance(value.get("ac"), list) or not all(isinstance(x, str) and x.strip() for x in value.get("ac", [])):
        missing.append("ac: nonempty criteria list")
    execution = value.get("execution")
    if not isinstance(execution, dict) or not execution.get("budget") or not execution.get("stop"):
        missing.append("execution: budget and stop")
    sources = value.get("inputs")
    if not isinstance(sources, list):
        missing.append("inputs: resolved local file list")
    else:
        for path in sources:
            if not isinstance(path, str) or not Path(path).is_file():
                missing.append("source: " + str(path))
    method = value.get("method")
    if not isinstance(method, str) or not Path(method).is_file():
        missing.append("method: available full source file")
    if missing:
        return {"ready": False, "missing": missing}, 2
    # A method/source reference is not a claim that an agent loaded its body.
    return {"ready": True, "task": value, "limits": ["Local packaging only; L1 resolves active memory policies and assigns the task.",
            "This is a helper input format, not a new Wolf public TASK schema."]}, 0


def wait_group_empty(pgid, cap=5.0):
    deadline = time.monotonic() + cap
    while True:
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.05)


def check(args):
    root, revision, before = identity(args.repo)
    command = args.command[1:] if args.command and args.command[0] == "--" else args.command
    if not command:
        raise ValueError("a verification command is required after --")
    if before:
        raise ValueError("check requires a committed clean worktree; assign a reproducible snapshot separately")
    log = Path(args.log).resolve()
    if log.is_relative_to(root):
        raise ValueError("verification log must be outside the checked worktree")
    if log.exists():
        raise ValueError("log exists; preserve it and choose a path for the new run")
    log.parent.mkdir(parents=True, exist_ok=True)
    outcome, code = "unknown", None
    group_limits = []
    with log.open("xb") as stream:
        try:
            # start_new_session makes the child a process-group leader: every
            # descendant inherits both the group and the log fd, so only a
            # group-wide kill/reap freezes the log before the digest is fixed.
            proc = subprocess.Popen(command, cwd=root, stdout=stream,
                                    stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as error:
            outcome = "not_started"
            stream.write(str(error).encode())
        else:
            try:
                code = proc.wait(timeout=args.timeout)
                outcome = "passed" if code == 0 else "failed"
            except subprocess.TimeoutExpired:
                outcome = "timeout"
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                group_limits.append("verification process group terminated after timeout")
            if not wait_group_empty(proc.pid):
                group_limits.append("process group not confirmed empty within 5s; log digest may be unstable")
    _, final_revision, after = identity(root)
    digest = hashlib.sha256()
    with log.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    record = {"task_id": args.task, "claim": args.claim, "cwd": str(root), "revision": revision,
              "final_revision": final_revision, "dirty_before": before, "dirty_after": after,
              "command": command, "outcome": outcome, "exit": code, "log": str(log),
              "log_sha256": digest.hexdigest(),
              "limits": ["The record is not ACCEPTED and is not persisted to Wolf memory by this helper.", *group_limits]}
    if revision != final_revision or after:
        record["outcome"] = "state_changed"
        record["limits"].append("HEAD changed during verification; applicability requires a decision.")
    key = {k: v for k, v in record.items() if k not in ("log", "limits")}
    record["evidence_key"] = hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()
    return record, 0 if record["outcome"] == "passed" else 1


def review(args):
    root, revision, dirty = identity(args.repo)
    if dirty:
        raise ValueError("worktree has changes not covered by a committed range; checkpoint or assign an explicit snapshot")
    base = git(root, "rev-parse", "--verify", args.base + "^{commit}")
    head = git(root, "rev-parse", "--verify", args.head + "^{commit}")
    if head != revision:
        raise ValueError("HEAD does not match the selected worktree state")
    git(root, "merge-base", "--is-ancestor", base, head)
    if base == head:
        raise ValueError("empty commit range")
    text = "# Review package\n\n" + base + ".." + head + "\n\n"
    text += git(root, "log", "--oneline", base + ".." + head) + "\n\n"
    text += git(root, "diff", "--stat", base, head) + "\n\n"
    text += git(root, "diff", "-U5", base, head) + "\n"
    if git(root, "rev-parse", "HEAD") != revision or git(root, "status", "--porcelain"):
        raise ValueError("worktree changed while preparing review")
    output = Path(args.output).resolve()
    if output.is_relative_to(root):
        raise ValueError("review output must be outside the reviewed worktree")
    return {"task_id": args.task, "base": base, "head": head,
            "package": publish(output, text), "limits": ["Attach criteria and norms separately; no expected verdict."]}, 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="operation", required=True)
    task = subs.add_parser("task-pack")
    task.add_argument("--input", required=True)
    verify = subs.add_parser("check")
    verify.add_argument("--repo", required=True)
    verify.add_argument("--task", required=True)
    verify.add_argument("--claim", required=True)
    verify.add_argument("--log", required=True)
    verify.add_argument("--timeout", type=int, default=120)
    verify.add_argument("command", nargs=argparse.REMAINDER)
    package = subs.add_parser("review-package")
    package.add_argument("--repo", required=True)
    package.add_argument("--task", required=True)
    package.add_argument("--base", required=True)
    package.add_argument("--head", required=True)
    package.add_argument("--output", required=True)
    args = parser.parse_args()
    if args.operation == "check" and not 1 <= args.timeout <= 3600:
        parser.error("timeout must be 1..3600")
    try:
        result, code = {"task-pack": task_pack, "check": check, "review-package": review}[args.operation](args)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        result, code = {"error": str(error)}, 2
    print(json.dumps(result, ensure_ascii=False))
    return code


if __name__ == "__main__":
    sys.exit(main())
