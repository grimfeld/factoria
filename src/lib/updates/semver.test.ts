import { describe, it, expect } from "vitest";
import { compareVersions, isNewer } from "./semver";

describe("compareVersions", () => {
  it("orders by major, minor, patch", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.1.0")).toBe(1);
    expect(compareVersions("1.1.1", "1.1.2")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("tolerates a leading v", () => {
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("v2.0.0", "v1.9.9")).toBe(1);
  });

  it("ignores pre-release/build metadata", () => {
    expect(compareVersions("1.2.0-beta", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.0+build5", "1.2.0")).toBe(0);
  });

  it("treats missing parts as zero", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
  });
});

describe("isNewer", () => {
  it("is true only for a strictly greater version", () => {
    expect(isNewer("1.2.1", "1.2.0")).toBe(true);
    expect(isNewer("1.2.0", "1.2.0")).toBe(false);
    expect(isNewer("1.1.0", "1.2.0")).toBe(false);
  });
});
