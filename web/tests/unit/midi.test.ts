// La tastiera MIDI: i tasti bassi (General MIDI) suonano la batteria, gli altri niente fuori dal Roll.
import { describe, expect, it } from "vitest";
import { gmDrum } from "@/lib/daw/midi";

describe("gmDrum", () => {
  it("mappa General MIDI della batteria", () => {
    expect(gmDrum(36)).toBe("kick");
    expect(gmDrum(38)).toBe("clap");
    expect(gmDrum(42)).toBe("hat");
    expect(gmDrum(46)).toBe("openhat");
    expect(gmDrum(44)).toBe("shaker");
    expect(gmDrum(45)).toBe("tom");
    expect(gmDrum(41)).toBe("tom");
    expect(gmDrum(49)).toBe("perc");
    expect(gmDrum(60)).toBeNull();
    expect(gmDrum(30)).toBeNull();
  });
});
