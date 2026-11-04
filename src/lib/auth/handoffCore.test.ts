import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateHandoffRedirect,
  validateNextPath,
  extractHandoffCode,
  handoffRedirectUri,
} from "./handoffCore";

test("redirect allowlist", () => {
  assert.equal(validateHandoffRedirect("https://www.axecompanion.com/auth/handoff").ok, true);
  assert.equal(validateHandoffRedirect("https://tradingosapp.com/auth/handoff/").ok, true);
  assert.equal(validateHandoffRedirect("https://evil.com/auth/handoff").ok, false);
  assert.equal(validateHandoffRedirect("http://www.axecompanion.com/auth/handoff").ok, false);
  assert.equal(validateHandoffRedirect("https://u:p@tradingosapp.com/auth/handoff").ok, false);
  assert.equal(validateHandoffRedirect("https://tradingosapp.com/other").ok, false);
  assert.equal(validateHandoffRedirect("http://localhost:3000/auth/handoff").ok, false);
  assert.equal(validateHandoffRedirect("http://localhost:3000/auth/handoff", { allowLocalhost: true }).ok, true);
});

test("next path is same-origin only", () => {
  assert.equal(validateNextPath("/chat"), "/chat");
  assert.equal(validateNextPath("//evil.com"), "/");
  assert.equal(validateNextPath("https://evil.com"), "/");
  assert.equal(validateNextPath("/\\evil"), "/");
  assert.equal(validateNextPath(null), "/");
});

test("code extraction prefers fragment", () => {
  assert.equal(extractHandoffCode("#c=abc", "?c=zzz"), "abc");
  assert.equal(extractHandoffCode("", "?next=/x&c=q"), "q");
  assert.equal(extractHandoffCode("", "?next=/x"), null);
});

test("apex companion canonicalizes to www", () => {
  assert.equal(handoffRedirectUri("https://axecompanion.com"), "https://www.axecompanion.com/auth/handoff");
});
