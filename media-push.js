/* Push ticked stills into ceramics Media via Netlify Identity + Git Gateway. */
(function () {
  var IDENTITY_API = "https://jmceramics.netlify.app/.netlify/identity";
  var GIT = "https://jmceramics.netlify.app/.netlify/git/github";
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
    if (!window.netlifyIdentity) return Promise.reject(new Error("Identity missing"));
    try {
      netlifyIdentity.init({ APIUrl: IDENTITY_API });
    } catch (e) {}
    if (token()) return Promise.resolve(token());
    return new Promise(function (resolve, reject) {
      var done = false;
      function ok() {
        if (done) return;
        done = true;
        var t = token();
        if (t) resolve(t);
        else reject(new Error("Not signed in"));
      }
      netlifyIdentity.on("login", ok);
      netlifyIdentity.open("login");
      setTimeout(function () {
        if (!done) {
          done = true;
          reject(new Error("Sign in to Admin first, then try again"));
        }
      }, 120000);
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
    var sha;
    try {
      var prev = await fetch(url + "?ref=" + BRANCH, { headers: headers(t) });
      if (prev.ok) {
        var j = await prev.json();
        sha = j.sha;
      }
    } catch (e) {}
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    var res = await fetch(url, { method: "PUT", headers: headers(t), body: JSON.stringify(body) });
    if (!res.ok) {
      var txt = await res.text();
      throw new Error(res.status + " " + txt.slice(0, 180));
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
