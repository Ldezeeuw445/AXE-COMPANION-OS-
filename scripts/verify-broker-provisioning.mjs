/**
 * "Elk MT5-account moet kunnen" — en dat kon het niet.
 *
 * MetaApi kent alleen de brokerservers in zijn eigen register, dat van
 * MetaQuotes' publieke lijst komt. Een prop firm op een verse white-label
 * MT5-server staat daar niet in, en elke poging komt terug met
 * `E_SRV_NOT_FOUND` — hoe correct de inloggegevens ook zijn. Gemeten
 * 2026-10-19 tegen een echt Upcomers $200.000 funded account.
 *
 * De uitweg is die MetaApi's eigen foutmelding noemt: een provisioning profile
 * met de `servers.dat` van die broker. Profiel aanmaken, bestand uploaden,
 * account aanmaken met `provisioningProfileId`. Daarna is de broker bekend en
 * werkt alles erachter — koersen, candles, de symbolenlijst van het account —
 * net als bij elke andere.
 *
 * Run: node scripts/verify-broker-provisioning.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SERVERS_DAT_MAX_BYTES,
  checkServersDat,
  findProfileForServer,
  profileNameForServer,
} from "../src/lib/mt5/brokerProfile.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const client = read("src/lib/mt5/metaApiClient.ts");
const action = read("src/app/actions/mt5Cloud.ts");
const screen = read("src/components/accounts/AccountsScreen.tsx");

console.log("broker provisioning");

// ── the three MetaApi calls, in the shape MetaApi documents ──────────────
check("the profile is created at the documented endpoint, version 5", () => {
  assert.ok(client.includes("/users/current/provisioning-profiles"), "POST target");
  assert.ok(/version: 5/.test(client), "MT5 is version 5, not 4");
  assert.ok(/brokerTimezone/.test(client) && /brokerDSTSwitchTimezone/.test(client), "both are required");
});

check("servers.dat goes up as multipart, under the field name MetaApi reads", () => {
  assert.ok(/form\.append\("file"/.test(client), 'the field is named "file"');
  assert.ok(/method: "PUT"/.test(client), "upload is a PUT");
  assert.ok(
    /provisioning-profiles\/\$\{encodeURIComponent\(profileId\)\}\/\$\{fileName\}/.test(client),
    "the file name is part of the path",
  );
  // Setting Content-Type by hand drops the boundary and the upload arrives
  // unparseable. fetch writes it from the FormData.
  const upload = client.slice(client.indexOf("provisioningUploadProfileFile"));
  const headers = upload.slice(0, upload.indexOf("timeoutMs"));
  assert.ok(
    !/"Content-Type"/.test(headers),
    "fetch must write the multipart Content-Type itself, boundary included",
  );
});

check("the account is pointed at the profile, and still names its server", () => {
  // The profile says which broker; the server string still says which of that
  // broker's servers. MetaApi requires both.
  assert.ok(/provisioningProfileId: input\.provisioningProfileId/.test(client));
  assert.ok(/server: input\.server\.trim\(\)/.test(client), "server stays required");
  assert.ok(
    /\.\.\.\(input\.provisioningProfileId/.test(client),
    "omitted entirely when there is no profile, so the normal path is unchanged",
  );
});

// ── no duplicate uploads ─────────────────────────────────────────────────
check("a profile is found again by name instead of uploaded twice", () => {
  const name = profileNameForServer("Upcomers");
  assert.equal(name, "axe:upcomers");
  assert.equal(profileNameForServer("  UPCOMERS  "), name, "case and padding must not make a second one");

  const profiles = [
    { _id: "aaa", name: "axe:ftmo-server2" },
    { _id: "bbb", name: "AXE:Upcomers" },
  ];
  assert.equal(findProfileForServer(profiles, "Upcomers"), "bbb");
  assert.equal(findProfileForServer(profiles, "Pepperstone-Live01"), null);
  // MetaApi has returned both shapes over the years.
  assert.equal(findProfileForServer([{ id: "ccc", name: "axe:x" }], "x"), "ccc");
  assert.equal(findProfileForServer([{ name: "axe:x" }], "x"), null, "a row with no id is not a match");
  assert.equal(findProfileForServer([], "x"), null);
});

// ── the file check only catches real mistakes ────────────────────────────
check("the file check rejects what a person actually gets wrong", () => {
  const good = new Uint8Array(1024);
  assert.deepEqual(checkServersDat("servers.dat", good), { ok: true });
  assert.ok(!checkServersDat("servers.dat", new Uint8Array(0)).ok, "empty");
  assert.ok(!checkServersDat("servers.dat", new Uint8Array(SERVERS_DAT_MAX_BYTES + 1)).ok, "enormous");
  const wrong = checkServersDat("servers.txt", good);
  assert.ok(!wrong.ok);
  assert.ok(/servers\.txt/.test(wrong.reason), "name the file they picked, so they can see the mistake");
});

check("it does not try to be clever about a binary format nobody documents", () => {
  // Anything that inspects the bytes would be a guess that rejects valid
  // files. A terminal with one broker and a terminal with forty both produce
  // a valid servers.dat, and they look nothing alike.
  const helper = read("src/lib/mt5/brokerProfile.ts");
  assert.ok(!/magic|signature|0x|readUInt/i.test(helper), "no byte sniffing");
  assert.deepEqual(checkServersDat("", new Uint8Array(10)), { ok: true }, "no name is not a failure");
});

// ── it is wired, end to end ──────────────────────────────────────────────
check("the connect action creates, uploads and passes the profile", () => {
  assert.ok(action.includes("provisioningListProfiles("), "reuse before create");
  assert.ok(action.includes("provisioningCreateProfile("), "create when there is none");
  assert.ok(action.includes('provisioningUploadProfileFile(provisioningProfileId, "servers.dat"'), "upload");
  assert.ok(action.includes("provisioningProfileId,"), "and hand it to account creation");
  const listAt = action.indexOf("provisioningListProfiles(");
  const createAt = action.indexOf("provisioningCreateProfile(");
  assert.ok(listAt > 0 && createAt > listAt, "look for an existing profile first");
});

check("the profile id is remembered so nobody uploads it twice", () => {
  assert.ok(
    /\.\.\.\(provisioningProfileId \? \{ provisioningProfileId \} : \{\}\)/.test(action),
    "stored in metadata, so a reconnect on this broker just works",
  );
  // The broker timezone used to ride along with the profile id, so an account
  // on a broker MetaApi already knew stored none at all — and the chart then
  // had nothing to place the trading day with. It is written for every
  // account now, profile or not.
  assert.ok(
    /\n    brokerTimezone,\n/.test(action),
    "the broker timezone belongs on every account, not just newly registered brokers",
  );
});

check("the upload only appears once MetaApi has said it does not know the broker", () => {
  // A file picker on every connection makes the normal path look harder than
  // it is. Most brokers need nothing here.
  assert.ok(
    /err\?\.code === "mt5_server_not_found"/.test(screen),
    "gated on the one error it answers",
  );
  assert.ok(/name="serversDat"/.test(screen), "the field the action reads");
  assert.ok(/name="brokerTimezone"/.test(screen));
  assert.ok(/Open Data Folder/.test(screen), "tell them where the file is");
});

check("it is in the form a visitor actually sees", () => {
  // There are two MT5 connect forms in this repo. Mt5CloudConnectForm.tsx is
  // imported by nothing — this block went in there first, and would have been
  // invisible. Pin the live one.
  const sources = read("src/components/accounts/AccountsScreen.tsx");
  assert.ok(sources.includes('name="mt5Password"'), "AccountsScreen is the live connect form");
  assert.ok(sources.includes('name="serversDat"'), "and it is where the upload lives");
});

check("the framework will accept a file this size", () => {
  // Next caps a Server Action body at 1MB by default. The app refuses over
  // 2MB with a readable reason; anything between would otherwise die at the
  // framework with a message nobody can act on.
  const config = read("next.config.ts");
  assert.ok(/bodySizeLimit: "3mb"/.test(config), "raise it above the app's own 2MB ceiling");
  assert.equal(SERVERS_DAT_MAX_BYTES, 2 * 1024 * 1024);
});

console.log(`\n${passed} checks passed`);
