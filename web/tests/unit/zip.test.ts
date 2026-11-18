// Lo zip degli stem: un file che Windows, macOS e FL aprono (intestazioni giuste e CRC32 corretto).
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { storeZip } from "@/lib/daw/zip";

describe("storeZip", () => {
  it("scrive i file con nome, dimensione e CRC32, e l'indice in fondo", async () => {
    const a = new TextEncoder().encode("ciao kick");
    const b = new Uint8Array([1, 2, 3, 4, 5]);
    const bytes = new Uint8Array(await storeZip([{ name: "01 Kick.wav", data: a }, { name: "02 Bàss.wav", data: b }]).arrayBuffer());
    const dv = new DataView(bytes.buffer);
    expect(dv.getUint32(0, true)).toBe(0x04034b50);
    expect(dv.getUint32(14, true)).toBe(crc32(a));
    expect(dv.getUint32(18, true)).toBe(a.length);
    const end = bytes.length - 22;
    expect(dv.getUint32(end, true)).toBe(0x06054b50);
    expect(dv.getUint16(end + 10, true)).toBe(2);
    // l'indice punta all'inizio del secondo file
    const index = dv.getUint32(end + 16, true);
    const second = dv.getUint32(index + 46 + "01 Kick.wav".length + 42, true);
    expect(dv.getUint32(second, true)).toBe(0x04034b50);
    expect(dv.getUint32(second + 14, true)).toBe(crc32(b));
  });
});
