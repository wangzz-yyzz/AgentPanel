import { describe, expect, it } from "vitest";
import { BUILTIN_PROFILE_IDS, isBuiltinProfile } from "./agent";

describe("agent profile helpers", () => {
  it("recognizes builtin profiles", () => {
    for (const id of BUILTIN_PROFILE_IDS) {
      expect(isBuiltinProfile(id)).toBe(true);
    }
  });

  it("rejects non-builtin profiles", () => {
    expect(isBuiltinProfile("custom-gemini")).toBe(false);
  });
});
