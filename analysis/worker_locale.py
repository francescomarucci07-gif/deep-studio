"""
Deep Studio - worker locale (prototipo della M2)
================================================

Fa sul tuo PC quello che in futuro fara' Modal: prende i job "in coda" da Supabase,
scarica il mix (e gli stem) dal bucket privato, lancia l'analisi e salva il JSON 1.0
nella tabella analyses. La schermata "Analisi in corso" vede i LED avanzare da sola.

Uso (dalla radice del progetto, con l'ambiente virtuale attivo):
    python analysis/worker_locale.py              resta in ascolto, controlla ogni 5 secondi
    python analysis/worker_locale.py --una-volta  elabora al massimo un job ed esce

Legge NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY da web/.env.local (o
dall'ambiente). La service role key salta la RLS: questo script gira solo sul tuo PC.

Limiti del prototipo: niente Demucs (senza stem si analizza solo il mix) e niente
coach (M3): il job passa da "in analisi" a "pronta".
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import deep_studio_analyze as ds  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STAGE_TO_ANALYSIS = {"idea_grezza": "idea grezza", "mix_a_meta": "mix a meta'", "finita": "finita"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_env() -> tuple[str, str]:
    env = {}
    f = ROOT / "web" / ".env.local"
    if f.is_file():
        for line in f.read_text(encoding="utf-8-sig").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k.startswith(("NEXT_PUBLIC_SUPABASE", "SUPABASE"))})
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        sys.exit("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (in web/.env.local).")
    return url.rstrip("/"), key


class Supabase:
    """Il minimo indispensabile delle API REST di Supabase, con la sola libreria standard."""

    def __init__(self, url: str, key: str):
        self.url, self.key = url, key

    def _req(self, method: str, path: str, body=None, prefer: str | None = None) -> bytes:
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path.split('?')[0]}: {e.code} {e.read().decode(errors='replace')[:300]}")

    def select(self, table: str, query: str) -> list[dict]:
        return json.loads(self._req("GET", f"/rest/v1/{table}?{query}"))

    def update(self, table: str, query: str, patch: dict) -> list[dict]:
        return json.loads(self._req("PATCH", f"/rest/v1/{table}?{query}", patch, "return=representation"))

    def insert(self, table: str, row: dict) -> dict:
        return json.loads(self._req("POST", f"/rest/v1/{table}", row, "return=representation"))[0]

    def download(self, bucket: str, path: str, dest: Path) -> None:
        dest.write_bytes(self._req("GET", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}"))


def finite(obj):
    """Postgres (jsonb) non accetta NaN e Infinity: diventano null."""
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    if isinstance(obj, dict):
        return {k: finite(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [finite(v) for v in obj]
    return obj


def claim_next(db) -> dict | None:
    """Prende il job in coda piu' vecchio. L'update e' condizionato a status=in_coda:
    se due worker ci provano insieme, uno solo lo ottiene."""
    rows = db.select("jobs", "select=id,version_id,owner_id&status=eq.in_coda&order=created_at.asc&limit=1")
    if not rows:
        return None
    got = db.update("jobs", f"id=eq.{rows[0]['id']}&status=eq.in_coda",
                    {"status": "in_analisi", "started_at": now_iso()})
    return got[0] if got else None


def friendly(e: Exception) -> str:
    msg = str(e)
    if "soundfile" in msg:
        return "Questo FLAC non si legge sul worker (manca soundfile). Riprova o carica un WAV."
    if "/storage/" in msg:
        return "Non riesco a scaricare il file caricato. Riprova; se succede ancora, ricaricalo."
    if "wav" in msg.lower() or "riff" in msg.lower() or "format" in msg.lower():
        return "Non sono riuscito a leggere il file. Riprova; se succede ancora, esporta di nuovo il WAV da FL."
    return f"Errore durante l'analisi: {msg[:200]}"


def process(db, job: dict, workdir: Path) -> None:
    t0 = time.time()
    try:
        rows = db.select(
            "track_versions",
            f"id=eq.{job['version_id']}&select=id,version_no,stage,export_kind,"
            "tracks(id,title,subgenre),uploads(kind,role,file_name,storage_path)",
        )
        if not rows:
            raise RuntimeError("versione non trovata")
        v = rows[0]
        mix = next((u for u in v["uploads"] if u["kind"] == "mix"), None)
        if mix is None:
            raise RuntimeError("manca il mix")

        # il nome del file dice all'analisi se l'export e' con o senza master
        mix_path = workdir / f"v{v['version_no']}_{v['export_kind']}{Path(mix['file_name']).suffix.lower()}"
        db.download("audio", mix["storage_path"], mix_path)

        stems, roles = {}, {}
        for i, u in enumerate(u for u in v["uploads"] if u["kind"] == "stem"):
            name = Path(u["file_name"]).stem.lower()
            p = workdir / f"stem{i:02d}{Path(u['file_name']).suffix.lower()}"
            db.download("audio", u["storage_path"], p)
            stems[name], roles[name] = p, u["role"]

        subgenre = v["tracks"]["subgenre"]
        r = ds.analyze_file(
            mix_path, stems, None, subgenre, STAGE_TO_ANALYSIS.get(v["stage"]),
            ds.load_reference(subgenre, Path(__file__).parent), "upload", roles,
        )
        r["track"].update({"id": v["tracks"]["id"], "file": mix["file_name"], "version": v["version_no"]})
        if not stems:
            r["stems"]["note"] = "nessuno stem caricato; separazione con Demucs non ancora attiva (M2)"

        db.insert("analyses", {
            "version_id": v["id"],
            "job_id": job["id"],
            "owner_id": job["owner_id"],
            "schema_version": r["schema_version"],
            "analyzer": r["analyzer"],
            "data": finite(r),
            "compute_s": round(time.time() - t0, 2),
        })
        # niente coach ancora (M3): dall'analisi si passa direttamente a "pronta"
        db.update("jobs", f"id=eq.{job['id']}", {"status": "pronta", "finished_at": now_iso()})
        print(f"   pronta in {time.time() - t0:.1f} s")
    except Exception as e:  # il job va in errore, il worker continua con gli altri
        traceback.print_exc()
        db.update("jobs", f"id=eq.{job['id']}",
                  {"status": "errore", "error_message": friendly(e), "finished_at": now_iso()})


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Deep Studio - worker locale")
    ap.add_argument("--una-volta", action="store_true", help="elabora al massimo un job ed esce")
    ap.add_argument("--intervallo", type=float, default=5.0, help="secondi tra un controllo e l'altro")
    a = ap.parse_args(argv)

    db = Supabase(*load_env())
    print(f"Worker locale collegato a {db.url}. Ctrl+C per fermarlo.")
    while True:
        try:
            job = claim_next(db)
        except Exception as e:
            print(f"Supabase non risponde: {e}")
            job = None
        if job:
            print(f"-> job {job['id']}")
            with tempfile.TemporaryDirectory(prefix="deep-studio-") as d:  # l'audio non resta sul disco
                process(db, job, Path(d))
        if a.una_volta:
            return 0
        if not job:
            time.sleep(a.intervallo)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nWorker fermato.")
