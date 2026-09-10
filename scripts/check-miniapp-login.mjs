/**
 * Drives the Mini App login against a running dev server, the way the page does.
 *
 * Checks the three things that matter and cannot be checked by compiling: that valid
 * initData is accepted and yields a working session, that tampered initData is
 * refused, and that /api/auth/me is genuinely gated rather than merely decorated.
 *
 * Usage: node scripts/check-miniapp-login.mjs [baseUrl] [telegramUserId]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const telegramUserId = process.argv[3] ?? "100004";

let failures = 0;

function check(name, condition, detail = "") {
  const mark = condition ? "ok  " : "FAIL";
  if (!condition) failures += 1;
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`);
}

const minted = await fetch(`${base}/api/dev/init-data?telegramUserId=${telegramUserId}`);
const { initData } = await minted.json();
check("dev init-data minted", typeof initData === "string" && initData.length > 0);

// 1. An unauthenticated caller gets nothing.
const anonymous = await fetch(`${base}/api/auth/me`);
check("/api/auth/me is gated", anonymous.status === 401, `status ${anonymous.status}`);

// 2. Tampered initData is refused.
const tampered = new URLSearchParams(initData);
tampered.set("user", JSON.stringify({ id: 999999, first_name: "Imposter" }));
const forged = await fetch(`${base}/api/auth/miniapp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ initData: tampered.toString() }),
});
const forgedBody = await forged.json();
check(
  "tampered initData refused",
  forged.status === 401 && forgedBody.error === "bad-signature",
  `status ${forged.status}, error ${forgedBody.error}`,
);

// 3. Valid initData signs you in.
const signedIn = await fetch(`${base}/api/auth/miniapp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ initData }),
});
const signedInBody = await signedIn.json();
check("valid initData accepted", signedIn.ok, `status ${signedIn.status}`);

const cookie = signedIn.headers.get("set-cookie")?.split(";")[0];
check("session cookie issued", Boolean(cookie));
check("cookie is httpOnly", (signedIn.headers.get("set-cookie") ?? "").includes("HttpOnly"));

// 4. The session works.
const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
const meBody = await me.json();
check("session authenticates /api/auth/me", me.ok, `status ${me.status}`);
check(
  "session names the right player",
  meBody.player?.id === signedInBody.player?.id,
  `${meBody.player?.displayName}`,
);
check("card came back with it", typeof meBody.card?.rating === "number", `rating ${meBody.card?.rating}`);

// 5. A tampered cookie is refused.
const bent = `${cookie?.slice(0, -3)}xyz`;
const bentResponse = await fetch(`${base}/api/auth/me`, { headers: { cookie: bent } });
check("tampered session cookie refused", bentResponse.status === 401, `status ${bentResponse.status}`);

// 6. Logging out actually ends it.
const out = await fetch(`${base}/api/auth/me`, { method: "DELETE", headers: { cookie } });
check("logout succeeds", out.ok);
const cleared = out.headers.get("set-cookie") ?? "";
check("logout clears the cookie", /mzb_session=;|Max-Age=0/.test(cleared), cleared.slice(0, 60));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
