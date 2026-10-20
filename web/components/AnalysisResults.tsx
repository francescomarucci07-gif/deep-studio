// Le misure del JSON 1.0 (analysis/deep-studio-analysis-1.0.schema.json), in chiaro.
// Le note del coach arriveranno con la M3: qui ci sono solo numeri e controlli automatici.

type Bands = Record<"sub" | "low" | "low_mid" | "mid" | "high_mid" | "high", number>;
export type Analysis = {
  loudness: { integrated_lufs: number | null; true_peak_dbtp: number | null; lra_lu: number | null; clipped_samples: number };
  tonal_balance: { bands_db: Bands };
  dynamics: { crest_factor_db: number | null };
  stereo: { correlation: number; mono_fold_loss_above_120hz_db: number; side_ratio_by_band: { low: number } };
  sections: { start_s: number; end_s: number; bars: number; label_guess: string; energy: number }[];
  stems: { provided: boolean; items: Record<string, { file: string; role: string; rel_to_mix_lu: number | null }>; note?: string };
  clashes: { type: string; severity: number; bass_vs_kick_on_hits_db?: number; sidechain_depth_db?: number }[];
  tempo_bpm: number | null;
  reference: { name: string; lufs_diff: number; bands_diff_db: Partial<Bands> } | null;
  checks: { category: string; check: string; detail: string }[];
};

const BAND_LABELS: [keyof Bands, string, string][] = [
  ["sub", "Sub", "20–60 Hz"],
  ["low", "Low", "60–250 Hz"],
  ["low_mid", "Low-mid", "250–500 Hz"],
  ["mid", "Mid", "500 Hz–2 kHz"],
  ["high_mid", "High-mid", "2–6 kHz"],
  ["high", "High", "6–20 kHz"],
];
const BAND_FLOOR_DB = -48; // le barre partono da qui: sotto, la banda è praticamente vuota

const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(digits).replace(".", ",");
const signed = (v: number) => `${v > 0 ? "+" : ""}${fmt(v)}`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function Tile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="ds-tile">
      <span className="ds-label">{label}</span>
      <span className="ds-tile-value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
    </div>
  );
}

export function AnalysisResults({ data }: { data: Analysis }) {
  const ld = data.loudness;
  const ref = data.reference;
  const stems = Object.entries(data.stems.items ?? {});

  return (
    <div className="ds-stack">
      <section className="ds-module">
        <h2 className="ds-module-title">Misure</h2>
        <div className="ds-tiles">
          <Tile label="Loudness" value={fmt(ld.integrated_lufs)} unit="LUFS" />
          <Tile label="True peak" value={fmt(ld.true_peak_dbtp)} unit="dBTP" />
          <Tile label="Loudness range" value={fmt(ld.lra_lu)} unit="LU" />
          <Tile label="Crest factor" value={fmt(data.dynamics.crest_factor_db)} unit="dB" />
          <Tile label="Correlazione >120 Hz" value={fmt(data.stereo.correlation, 2)} />
          <Tile label="Perdita in mono" value={fmt(data.stereo.mono_fold_loss_above_120hz_db)} unit="dB" />
          <Tile label="Tempo" value={fmt(data.tempo_bpm)} unit="BPM" />
          <Tile label="Clipping" value={String(ld.clipped_samples)} unit="campioni" />
        </div>
        {ref && (
          <p className="ds-hint">
            Rispetto a {ref.name}: loudness {signed(ref.lufs_diff)} LU.
          </p>
        )}
      </section>

      <section className="ds-module">
        <h2 className="ds-module-title">Bilancio tonale</h2>
        <table className="ds-bars">
          <caption className="ds-visually-hidden">Energia per banda, in dB rispetto all&apos;energia totale</caption>
          <thead>
            <tr className="ds-bars-head">
              <th scope="col">Banda</th>
              <th scope="col">
                <span className="ds-visually-hidden">Energia</span>
              </th>
              <th scope="col" className="ds-bar-value">
                dB
              </th>
              {ref && (
                <th scope="col" className="ds-bar-value">
                  vs riferimenti
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {BAND_LABELS.map(([key, name, range]) => {
              const v = data.tonal_balance.bands_db[key];
              const pct = Math.max(0, Math.min(100, ((v - BAND_FLOOR_DB) / -BAND_FLOOR_DB) * 100));
              const diff = ref?.bands_diff_db[key];
              return (
                <tr key={key} title={`${name} (${range}): ${fmt(v)} dB`}>
                  <th scope="row">
                    {name} <span className="ds-meta">{range}</span>
                  </th>
                  <td className="ds-bar-cell">
                    <span className="ds-bar" style={{ width: `${pct}%` }} />
                  </td>
                  <td className="ds-bar-value">{fmt(v)} dB</td>
                  {ref && <td className="ds-bar-value">{diff === undefined ? "—" : `${signed(diff)} dB`}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="ds-hint">
          dB rispetto all&apos;energia totale del mix: ha senso confrontato con una traccia di riferimento
          {ref ? "." : " (ancora nessun riferimento per questo sottogenere)."}
        </p>
      </section>

      {data.sections.length > 0 && (
        <section className="ds-module">
          <h2 className="ds-module-title">Sezioni</h2>
          <ul className="ds-list">
            {data.sections.map((s) => (
              <li key={s.start_s}>
                <span>
                  <strong>{s.label_guess}</strong>{" "}
                  <span className="ds-meta">
                    {mmss(s.start_s)}–{mmss(s.end_s)} · {s.bars} battute
                  </span>
                </span>
                <span className="ds-energy" title={`Energia ${Math.round(s.energy * 100)}%`}>
                  <span style={{ width: `${s.energy * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <p className="ds-hint">Le etichette sono stime: “drop” è la parte con più energia.</p>
        </section>
      )}

      <section className="ds-module">
        <h2 className="ds-module-title">Stem</h2>
        {stems.length === 0 ? (
          <p className="ds-lead">
            Nessuno stem caricato. Con kick e bassline separati misuro anche lo scontro nel low end.
          </p>
        ) : (
          <ul className="ds-list">
            {stems.map(([key, s]) => (
              <li key={key}>
                <span>{s.file}</span>
                <span className="ds-meta">
                  {s.role} · {s.rel_to_mix_lu === null ? "muto" : `${signed(s.rel_to_mix_lu)} LU dal mix`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.clashes
          .filter((c) => c.type === "kick_bass")
          .map((c, i) => (
            <p key={i} className="ds-message">
              Kick e bassline: la bassline sta a {fmt(c.bass_vs_kick_on_hits_db)} dB dal kick sui colpi, sidechain{" "}
              {fmt(c.sidechain_depth_db)} dB; scontro su {Math.round(c.severity * 100)}% dei colpi.
            </p>
          ))}
      </section>

      <section className="ds-module">
        <h2 className="ds-module-title">Controlli automatici</h2>
        {data.checks.length === 0 ? (
          <p className="ds-lead">Nessun allarme sui controlli di base.</p>
        ) : (
          <ul className="ds-list">
            {data.checks.map((c) => (
              <li key={c.check}>
                <span>{c.detail}</span>
                <span className="ds-meta">{c.category}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="ds-hint">Soglie provvisorie. Le note vere del coach arrivano con la M3.</p>
      </section>
    </div>
  );
}
