import json
from datetime import datetime, timezone, timedelta

from mt5_bridge import host_metrics as hm


PROBE = (
    "CPU 100 80 200 150\n"  # totals 100->200, idle 80->150 → 30% used
    "MEM 1000 400\n"        # 60% used
    "DISK 16%\n"
)


def test_parse_linux_probe_percentages():
    row = hm.parse_linux_probe(PROBE, measured_at=datetime(2026, 11, 27, 15, 0, tzinfo=timezone.utc))
    assert row["cpu"] == 30.0
    assert row["mem"] == 60.0
    assert row["disk"] == 16.0
    assert row["measured_at"] == "2026-11-27T15:00:00Z"


def test_parse_linux_probe_ignores_junk_and_does_not_invent():
    row = hm.parse_linux_probe("nope\nCPU 1\nMEM x y\n")
    assert row["cpu"] is None and row["mem"] is None and row["disk"] is None


def test_parse_metrics_file_rejects_non_numbers_and_keeps_a_timestamp(tmp_path):
    pad = tmp_path / "host-metrics.json"
    pad.write_text(json.dumps({"cpu": 12.34, "mem": 40, "disk": "16%", "measured_at": "2026-11-27T15:00:00Z"}))
    # "16%" is not a plain number — disk stays null, the rest is kept.
    row = hm.read_metrics_file(str(pad))
    assert row["cpu"] == 12.3 and row["mem"] == 40.0 and row["disk"] is None
    assert row["measured_at"] == "2026-11-27T15:00:00Z"
    assert hm.parse_metrics_file({"ok": True, "trading": True}) is None
    assert hm.parse_metrics_file("nope") is None


def test_collect_prefers_a_fresh_file_over_proc(tmp_path, monkeypatch):
    pad = tmp_path / "host-metrics.json"
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pad.write_text(json.dumps({"cpu": 11.0, "mem": 22.0, "disk": 33.0, "measured_at": stamp}))
    monkeypatch.setattr(hm, "collect_from_proc", lambda: {"cpu": 1, "mem": 1, "disk": 1, "measured_at": stamp, "source": "proc"})
    row = hm.collect(paths=(str(pad),))
    assert row["cpu"] == 11.0 and row["source"] == "file"


def test_collect_falls_back_to_proc_when_the_file_is_stale(tmp_path, monkeypatch):
    pad = tmp_path / "host-metrics.json"
    old = (datetime.now(timezone.utc) - timedelta(seconds=hm.FILE_FRESH_S + 30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    pad.write_text(json.dumps({"cpu": 11.0, "mem": 22.0, "disk": 33.0, "measured_at": old}))
    monkeypatch.setattr(hm, "collect_from_proc", lambda: {"cpu": 7.0, "mem": 8.0, "disk": 9.0, "measured_at": "2026-11-27T16:00:00Z", "source": "proc"})
    row = hm.collect(paths=(str(pad),))
    assert row["cpu"] == 7.0 and row["source"] == "proc"


def test_collect_uses_the_stale_file_when_proc_is_unavailable(tmp_path, monkeypatch):
    pad = tmp_path / "host-metrics.json"
    old = "2026-11-27T12:00:00Z"
    pad.write_text(json.dumps({"cpu": 11.0, "mem": 22.0, "disk": 33.0, "measured_at": old}))
    monkeypatch.setattr(hm, "collect_from_proc", lambda: None)
    row = hm.collect(paths=(str(pad),))
    assert row["cpu"] == 11.0 and row["measured_at"] == old


def test_payload_never_includes_account_or_secret_fields():
    body = hm.payload({"cpu": 1, "mem": 2, "disk": 3, "measured_at": "2026-11-27T15:00:00Z", "accountId": "secret", "login": 123})
    assert body == {"ok": True, "cpu": 1.0, "mem": 2.0, "disk": 3.0, "measured_at": "2026-11-27T15:00:00Z"}
    empty = hm.payload({"cpu": None, "mem": None, "disk": None, "measured_at": "2026-11-27T15:00:00Z"})
    assert empty == {"ok": False, "cpu": None, "mem": None, "disk": None, "measured_at": None}


def test_collect_from_proc_is_injectable_and_matches_the_probe():
    samples = iter(["cpu  20 0 0 80 0 0 0\n", "cpu  50 0 0 150 0 0 0\n"])
    mem = "MemTotal: 1000 kB\nMemAvailable: 400 kB\n"

    def read(path: str):
        if path == "/proc/stat":
            return next(samples)
        if path == "/proc/meminfo":
            return mem
        return None

    row = hm.collect_from_proc(sleep=lambda _: None, read=read, disk_usage=lambda _: (100, 16, 84))
    assert row["cpu"] == 30.0 and row["mem"] == 60.0 and row["disk"] == 16.0
    assert row["source"] == "proc"
