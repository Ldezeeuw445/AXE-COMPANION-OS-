import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getPublicAppBaseUrl, getVapidPublicKey, getVapidSubject, normalizePublicAppBaseUrl } from "./env";

const PREV_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const PREV_PUBLIC_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PREV_VAPID = process.env.VAPID_PUBLIC_KEY;
const PREV_VAPID_SUBJECT = process.env.VAPID_SUBJECT;

afterEach(() => {
  if (PREV_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = PREV_APP_URL;
  if (PREV_PUBLIC_VAPID === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = PREV_PUBLIC_VAPID;
  if (PREV_VAPID === undefined) delete process.env.VAPID_PUBLIC_KEY;
  else process.env.VAPID_PUBLIC_KEY = PREV_VAPID;
  if (PREV_VAPID_SUBJECT === undefined) delete process.env.VAPID_SUBJECT;
  else process.env.VAPID_SUBJECT = PREV_VAPID_SUBJECT;
});

describe("normalizePublicAppBaseUrl", () => {
  it("rewrites apex axecompanion.com to www", () => {
    assert.equal(
      normalizePublicAppBaseUrl("https://axecompanion.com"),
      "https://www.axecompanion.com",
    );
    assert.equal(
      normalizePublicAppBaseUrl("https://axecompanion.com/"),
      "https://www.axecompanion.com",
    );
  });

  it("keeps www and strips a trailing slash", () => {
    assert.equal(
      normalizePublicAppBaseUrl("https://www.axecompanion.com/"),
      "https://www.axecompanion.com",
    );
  });

  it("leaves localhost and other hosts alone", () => {
    assert.equal(normalizePublicAppBaseUrl("http://localhost:5000"), "http://localhost:5000");
    assert.equal(normalizePublicAppBaseUrl("https://staging.example.com"), "https://staging.example.com");
  });

  it("uses the fallback when unset", () => {
    assert.equal(normalizePublicAppBaseUrl(undefined), "http://localhost:5000");
    assert.equal(
      normalizePublicAppBaseUrl("   ", "https://www.axecompanion.com"),
      "https://www.axecompanion.com",
    );
  });
});

describe("getPublicAppBaseUrl", () => {
  it("normalises production apex env to www", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://axecompanion.com";
    assert.equal(getPublicAppBaseUrl(), "https://www.axecompanion.com");
  });
});

describe("getVapidPublicKey", () => {
  it("prefers NEXT_PUBLIC_VAPID_PUBLIC_KEY and falls back to VAPID_PUBLIC_KEY", () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PUBLIC_KEY;
    assert.equal(getVapidPublicKey(), undefined);

    process.env.VAPID_PUBLIC_KEY = "server-only-key";
    assert.equal(getVapidPublicKey(), "server-only-key");

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key";
    assert.equal(getVapidPublicKey(), "public-key");
  });

  it("treats an empty NEXT_PUBLIC value as unset so the fallback can win", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "  ";
    process.env.VAPID_PUBLIC_KEY = "server-only-key";
    assert.equal(getVapidPublicKey(), "server-only-key");
  });
});

describe("getVapidSubject", () => {
  it("uses VAPID_SUBJECT when set, else mailto on the public host", () => {
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    assert.equal(getVapidSubject(), "mailto:ops@example.com");
    delete process.env.VAPID_SUBJECT;
    process.env.NEXT_PUBLIC_APP_URL = "https://www.axecompanion.com";
    assert.equal(getVapidSubject(), "mailto:alerts@www.axecompanion.com");
  });
});
