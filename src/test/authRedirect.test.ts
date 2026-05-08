import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_POST_AUTH_TARGET,
  POST_AUTH_TARGET_KEY,
  normalizePostAuthTarget,
  postAuthTargetFromLocation,
  storePostAuthTarget,
  takePostAuthTarget,
} from "@/lib/authRedirect";

describe("auth redirect helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("keeps protected app targets after login", () => {
    expect(DEFAULT_POST_AUTH_TARGET).toBe("/portal");
    expect(normalizePostAuthTarget("/jobs?tab=new#top")).toBe("/jobs?tab=new#top");
    expect(postAuthTargetFromLocation({ pathname: "/applications/123", search: "?edit=1" })).toBe(
      "/applications/123?edit=1",
    );
  });

  it("drops public and unsafe targets", () => {
    expect(normalizePostAuthTarget("/")).toBeNull();
    expect(normalizePostAuthTarget("/login")).toBeNull();
    expect(normalizePostAuthTarget("/auth/callback")).toBeNull();
    expect(normalizePostAuthTarget("//evil.example")).toBeNull();
  });

  it("stores and consumes one post-auth target", () => {
    storePostAuthTarget("/portal");

    expect(window.sessionStorage.getItem(POST_AUTH_TARGET_KEY)).toBe("/portal");
    expect(takePostAuthTarget()).toBe("/portal");
    expect(window.sessionStorage.getItem(POST_AUTH_TARGET_KEY)).toBeNull();
  });
});
