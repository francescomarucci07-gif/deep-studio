"""Test del worker locale con un finto Supabase in memoria (nessuna rete)."""
import json
import shutil
from pathlib import Path

import jsonschema

import worker_locale as w
from conftest import kick_track, sine, stereo, write_wav

SCHEMA = json.loads((Path(w.__file__).parent / "deep-studio-analysis-1.0.schema.json").read_text(encoding="utf-8"))


class FakeDB:
    def __init__(self, files: dict):
        self.files = files  # percorso nel bucket -> file locale
        self.jobs = []
        self.versions = []
        self.analyses = []

    def select(self, table, query):
        if table == "jobs":
            return [j for j in self.jobs if j["status"] == "in_coda"][:1]
        if table == "track_versions":
            vid = query.split("id=eq.")[1].split("&")[0]
            return [v for v in self.versions if v["id"] == vid]
        raise AssertionError(table)

    def update(self, table, query, patch):
        jid = query.split("id=eq.")[1].split("&")[0]
        out = []
        for j in self.jobs:
            if j["id"] == jid and ("status=eq.in_coda" not in query or j["status"] == "in_coda"):
                j.update(patch)
                out.append(j)
        return out

    def insert(self, table, row):
        assert table == "analyses"
        json.dumps(row, allow_nan=False)  # come Postgres: niente NaN/Infinity
        self.analyses.append(row)
        return row

    def download(self, bucket, path, dest):
        if path not in self.files:
            raise RuntimeError(f"GET /storage/v1/object/{bucket}/{path}: 404")
        shutil.copy(self.files[path], dest)


def make_db(tmp_path, with_stems=True, broken_mix=False):
    secs, bpm = 12, 124
    kick, bass = kick_track(bpm, secs) * 0.8, sine(50, secs, 0.5)
    mix = tmp_path / "mix.wav"
    if broken_mix:
        mix.write_bytes(b"non sono un wav")
    else:
        write_wav(mix, stereo(0.5 * (kick + bass)))
    files = {"u1/t1/v1/mix-Sunset.wav": mix}
    uploads = [{"kind": "mix", "role": None, "file_name": "Sunset.wav", "storage_path": "u1/t1/v1/mix-Sunset.wav"}]
    if with_stems:
        write_wav(tmp_path / "k.wav", stereo(kick))
        write_wav(tmp_path / "b.wav", stereo(bass))
        files["u1/t1/v1/stem-01-Low.wav"] = tmp_path / "k.wav"
        files["u1/t1/v1/stem-02-Sub_Thing.wav"] = tmp_path / "b.wav"
        # ruoli corretti a mano nella dashboard: "Low" da solo sarebbe "other"
        uploads += [
            {"kind": "stem", "role": "kick", "file_name": "Low.wav", "storage_path": "u1/t1/v1/stem-01-Low.wav"},
            {"kind": "stem", "role": "bass", "file_name": "Sub_Thing.wav", "storage_path": "u1/t1/v1/stem-02-Sub_Thing.wav"},
        ]
    db = FakeDB(files)
    db.versions.append({
        "id": "v1", "version_no": 1, "stage": "mix_a_meta", "export_kind": "nomaster",
        "tracks": {"id": "t1", "title": "Sunset", "subgenre": "deep"}, "uploads": uploads,
    })
    db.jobs.append({"id": "j1", "version_id": "v1", "owner_id": "u1", "status": "in_coda"})
    return db


def test_worker_porta_il_job_a_pronta_e_salva_json_valido(tmp_path):
    db = make_db(tmp_path)
    job = w.claim_next(db)
    assert job["status"] == "in_analisi"
    assert w.claim_next(db) is None  # gia' preso: un secondo worker non lo ottiene
    work = tmp_path / "work"
    work.mkdir()
    w.process(db, job, work)

    assert db.jobs[0]["status"] == "pronta"
    a = db.analyses[0]
    assert a["owner_id"] == "u1" and a["job_id"] == "j1" and a["schema_version"] == "1.0"
    jsonschema.validate(a["data"], SCHEMA)
    assert a["data"]["track"]["file"] == "Sunset.wav"
    assert a["data"]["track"]["stage"] == "mix a meta'"
    assert {k: s["role"] for k, s in a["data"]["stems"]["items"].items()} == {"low": "kick", "sub_thing": "bass"}
    assert a["data"]["clashes"] and a["data"]["clashes"][0]["type"] == "kick_bass"


def test_worker_mette_in_errore_un_file_illeggibile(tmp_path):
    db = make_db(tmp_path, with_stems=False, broken_mix=True)
    job = w.claim_next(db)
    work = tmp_path / "work"
    work.mkdir()
    w.process(db, job, work)
    assert db.jobs[0]["status"] == "errore"
    assert "esporta di nuovo" in db.jobs[0]["error_message"]
    assert db.analyses == []


def test_finite_toglie_nan_e_infinito():
    assert w.finite({"a": float("-inf"), "b": [1.0, float("nan")], "c": "x"}) == {"a": None, "b": [1.0, None], "c": "x"}
