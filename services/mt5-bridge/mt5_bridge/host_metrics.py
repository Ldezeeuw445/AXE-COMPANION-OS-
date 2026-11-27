"""CPU, RAM and disk of the box the bridge runs on. Read-only.

The bridge process is Windows Python under Wine, so it cannot always see
/proc. A Linux timer writes /opt/mt5-bridge/var/host-metrics.json every 15 s
(deploy/mt5-host-metrics). This module reads that file, and only then tries
/proc itself. Nothing here talks to MT5 or places an order.

The response is only percentages and a timestamp: no login, account, host
name, path or token.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

DEFAULT_FILES = (
    os.environ.get("MT5_BRIDGE_METRICS_FILE") or "",
    "/opt/mt5-bridge/var/host-metrics.json",
    r"Z:\opt\mt5-bridge\var\host-metrics.json",
)

# A file older than this is still returned (with its real timestamp) if /proc
# cannot be read; the collector marks it stale after two minutes.
FILE_FRESH_S = 60.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_linux_probe(output: str, measured_at: Optional[datetime] = None) -> dict[str, Any]:
    """The stdout of deploy/mt5-host-metrics (CPU / MEM / DISK lines)."""
    out: dict[str, Any] = {"cpu": None, "mem": None, "disk": None, "measured_at": _iso(measured_at or _now())}
    for line in (output or "").splitlines():
        f = line.split()
        try:
            if f[0] == "CPU" and len(f) == 5:
                t1, i1, t2, i2 = (float(x) for x in f[1:])
                if t2 > t1:
                    out["cpu"] = round(max(0.0, min(100.0, (1 - (i2 - i1) / (t2 - t1)) * 100)), 1)
            elif f[0] == "MEM" and len(f) == 3:
                total, avail = float(f[1]), float(f[2])
                if total > 0:
                    out["mem"] = round(max(0.0, min(100.0, (total - avail) / total * 100)), 1)
            elif f[0] == "DISK" and len(f) == 2:
                out["disk"] = round(float(f[1].rstrip("%")), 1)
        except (ValueError, IndexError):
            continue
    return out


def _num(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return round(max(0.0, min(100.0, n)), 1)


def parse_metrics_file(raw: Any) -> Optional[dict[str, Any]]:
    """A JSON object from the Linux writer. Rejects anything that is not numbers + a time."""
    if not isinstance(raw, dict):
        return None
    cpu, mem, disk = _num(raw.get("cpu")), _num(raw.get("mem")), _num(raw.get("disk"))
    if cpu is None and mem is None and disk is None:
        return None
    measured = raw.get("measured_at") or raw.get("ts")
    if isinstance(measured, str) and measured.strip():
        stamp = measured.strip()
    else:
        stamp = _iso(_now())
    return {"cpu": cpu, "mem": mem, "disk": disk, "measured_at": stamp, "source": "file"}


def read_metrics_file(path: str) -> Optional[dict[str, Any]]:
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return None
    return parse_metrics_file(raw)


def _age_seconds(row: dict[str, Any], now: Optional[datetime] = None) -> Optional[float]:
    stamp = row.get("measured_at")
    if not isinstance(stamp, str):
        return None
    try:
        ts = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now or _now()).timestamp() - ts.timestamp()


def collect_from_proc(
    sleep: Callable[[float], None] = time.sleep,
    read: Optional[Callable[[str], Optional[str]]] = None,
    disk_usage: Callable[[str], Any] = shutil.disk_usage,
) -> Optional[dict[str, Any]]:
    """Best-effort /proc read. Returns None when this process cannot see Linux procfs."""

    def _read(path: str) -> Optional[str]:
        try:
            with open(path, encoding="utf-8") as f:
                return f.read()
        except OSError:
            return None

    read = read or _read

    def cpu_pair(text: Optional[str]) -> Optional[tuple[float, float]]:
        if not text:
            return None
        for line in text.splitlines():
            if line.startswith("cpu "):
                p = line.split()
                try:
                    # Same fields as AXE Core's LINUX_PROBE: user..softirq, idle+iowait.
                    parts = [float(x) for x in p[1:8]]
                except ValueError:
                    return None
                if len(parts) < 4:
                    return None
                total = sum(parts)
                idle = parts[3] + (parts[4] if len(parts) > 4 else 0)
                return total, idle
        return None

    first = cpu_pair(read("/proc/stat"))
    if first is None:
        return None
    sleep(0.5)
    second = cpu_pair(read("/proc/stat"))
    mem = read("/proc/meminfo")
    lines = []
    if first and second:
        lines.append(f"CPU {first[0]} {first[1]} {second[0]} {second[1]}")
    if mem:
        total = avail = None
        for line in mem.splitlines():
            f = line.split()
            if len(f) >= 2 and f[0] == "MemTotal:":
                total = f[1]
            elif len(f) >= 2 and f[0] == "MemAvailable:":
                avail = f[1]
        if total is not None and avail is not None:
            lines.append(f"MEM {total} {avail}")
    try:
        total, used, _free = disk_usage("/")
        if total:
            lines.append(f"DISK {round(used / total * 100, 1)}%")
    except OSError:
        pass
    row = parse_linux_probe("\n".join(lines))
    if row["cpu"] is None and row["mem"] is None and row["disk"] is None:
        return None
    row["source"] = "proc"
    return row


def collect(paths: tuple[str, ...] | None = None) -> dict[str, Any]:
    """File if it is fresh, else /proc, else an older file, else empty numbers."""
    rows: list[dict[str, Any]] = []
    for path in paths if paths is not None else DEFAULT_FILES:
        if not path:
            continue
        row = read_metrics_file(path)
        if row:
            rows.append(row)
    fresh = [r for r in rows if (a := _age_seconds(r)) is not None and a <= FILE_FRESH_S]
    if fresh:
        # Several paths may point at the same file; the youngest wins.
        fresh.sort(key=lambda r: _age_seconds(r) or 0)
        return fresh[0]
    proc = collect_from_proc()
    if proc:
        return proc
    if rows:
        rows.sort(key=lambda r: _age_seconds(r) if _age_seconds(r) is not None else 10**12)
        return rows[0]
    return {"cpu": None, "mem": None, "disk": None, "measured_at": None, "source": "none"}


def payload(row: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """The JSON body of GET /host/metrics. Never includes account or secret fields."""
    row = row if row is not None else collect()
    cpu, mem, disk = _num(row.get("cpu")), _num(row.get("mem")), _num(row.get("disk"))
    ok = any(v is not None for v in (cpu, mem, disk))
    return {
        "ok": ok,
        "cpu": cpu,
        "mem": mem,
        "disk": disk,
        "measured_at": row.get("measured_at") if ok else None,
    }
