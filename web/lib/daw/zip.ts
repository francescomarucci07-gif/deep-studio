// Un file .zip "senza compressione" (metodo STORE), scritto a mano: per mettere gli stem in un solo download.
// Il WAV non si comprime quasi per niente, quindi non serve una libreria di compressione. Ogni file nello zip ha
// un'intestazione con nome, dimensione e CRC32 (un controllo che i byte siano arrivati interi); in fondo c'è
// l'indice con la posizione di ogni file.

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function storeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const index: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); // intestazione del file
    head.setUint16(4, 20, true); // versione minima
    head.setUint16(6, 0x0800, true); // nomi in UTF-8
    head.setUint16(8, 0, true); // STORE
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    parts.push(head.buffer, name, f.data as Uint8Array<ArrayBuffer>);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); // voce dell'indice
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, f.data.length, true);
    entry.setUint32(24, f.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    const e = new Uint8Array(46 + name.length);
    e.set(new Uint8Array(entry.buffer));
    e.set(name, 46);
    index.push(e);
    offset += 30 + name.length + f.data.length;
  }
  const size = index.reduce((a, e) => a + e.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); // fine dell'indice
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(index as Uint8Array<ArrayBuffer>[]), end.buffer], { type: "application/zip" });
}
