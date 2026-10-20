/* Push ticked stills into ceramics Media via Netlify Identity + Git Gateway. */
(function () {
  var onNetlify = location.hostname.indexOf("netlify.app") !== -1;
  var IDENTITY_API = onNetlify ? (location.origin + "/.netlify/identity") : "https://jmceramics.netlify.app/.netlify/identity";
  var GIT = onNetlify ? (location.origin + "/.netlify/git/github") : "https://jmceramics.netlify.app/.netlify/git/github";
  var BRANCH = "main";
  var PREFIX = "jm-website/images/inbox/";

  function token() {
    try {
      if (window.netlifyIdentity && netlifyIdentity.currentUser() && netlifyIdentity.currentUser().token) {
        return netlifyIdentity.currentUser().token.access_token;
      }
    } catch (e) {}
    return "";
  }

  function ensureIdentity() {
    if (!window.netlifyIdentity) return Promise.reject(new Error("No sign-in on this page"));
    try { netlifyIdentity.init({ APIUrl: IDENTITY_API }); } catch (e) {}
    if (token()) return Promise.resolve(token());
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish(err, t) {
        if (done) return;
        done = true;
        if (t) resolve(t);
        else reject(err || new Error("No sign-in"));
      }
      netlifyIdentity.on("login", function () { finish(null, token()); });
      try { netlifyIdentity.open("login"); }
      catch (e) { finish(new Error("Sign-in box did not open")); return; }
      setTimeout(function () { finish(new Error("Sign-in did not finish")); }, 15000);
    });
  }

  function blobToB64(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf);
      var s = "";
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(s);
    });
  }

  function headers(t) {
    return { Authorization: "Bearer " + t, "Content-Type": "application/json" };
  }

  async function putGit(path, b64, message, t) {
    var url = GIT + "/contents/" + path;
    var opts = { headers: headers(t), credentials: "include", mode: "cors" };
    var sha;
    try {
      var prev = await fetch(url + "?ref=" + BRANCH, opts);
      if (prev.ok) {
        var j = await prev.json();
        sha = j.sha;
      }
    } catch (e) {}
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 20000);
    var res;
    try {
      res = await fetch(url, {
        method: "PUT",
        headers: headers(t),
        body: JSON.stringify(body),
        credentials: "include",
        mode: "cors",
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res || !res.ok) {
      var txt = res ? await res.text() : "no reply";
      throw new Error((res ? res.status : "0") + " " + txt.slice(0, 180));
    }
  }

  window.pushStillsToMedia = async function (picked, stamp, onStatus) {
    var say = onStatus || function () {};
    var t = await ensureIdentity();
    var n = 0;
    for (var i = 0; i < picked.length; i++) {
      var item = picked[i];
      say("Sending " + (i + 1) + " of " + picked.length + " to Media…");
      var blob = await toBlob(item.framed);
      var tag = item.framed.width + "x" + item.framed.height;
      var safe = String(item.name || "still").replace(/[^\w.-]+/g, "-");
      var path = PREFIX + stamp + "/" + safe + "-" + tag + ".jpg";
      var b64 = await blobToB64(blob);
      await putGit(path, b64, "Studio still " + safe, t);
      n++;
    }
    return n;
  };

  if (window.netlifyIdentity) {
    try { netlifyIdentity.init({ APIUrl: IDENTITY_API }); } catch (e) {}
  }
})();
