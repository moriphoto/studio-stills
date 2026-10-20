/* Push ticked stills into ceramics Media via Netlify Identity + Git Gateway. */
(function () {
  var onNetlify = location.hostname.indexOf("netlify.app") !== -1;
  var IDENTITY_API = onNetlify ? (location.origin + "/.netlify/identity") : "https://jmceramics.netlify.app/.netlify/identity";
  var GIT = onNetlify ? (location.origin + "/.netlify/git/github") : "https://jmceramics.netlify.app/.netlify/git/github";
  var BRANCH = "main";
  var PREFIX = "jm-website/images/uploads/";

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

  async function gitSend(path, method, body, t) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 25000);
    var res;
    try {
      res = await fetch(GIT + "/" + path, {
        method: method,
        headers: headers(t),
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
        mode: "cors",
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    var text = res ? await res.text() : "";
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res || !res.ok) {
      throw new Error((res ? res.status : "0") + " " + text.slice(0, 160));
    }
    return data;
  }

  async function commitAll(files, message, t) {
    var tree = [];
    for (var i = 0; i < files.length; i++) {
      var blob = await gitSend("git/blobs", "POST", { content: files[i].b64, encoding: "base64" }, t);
      tree.push({ path: files[i].path, mode: "100644", type: "blob", sha: blob.sha });
    }
    var ref = await gitSend("git/ref/heads/" + BRANCH, "GET", null, t);
    var parent = ref.object.sha;
    var current = await gitSend("git/commits/" + parent, "GET", null, t);
    var nextTree = await gitSend("git/trees", "POST", { base_tree: current.tree.sha, tree: tree }, t);
    var commit = await gitSend("git/commits", "POST", { message: message, tree: nextTree.sha, parents: [parent] }, t);
    await gitSend("git/refs/heads/" + BRANCH, "PATCH", { sha: commit.sha }, t);
  }

  window.pushStillsToMedia = async function (picked, stamp, onStatus) {
    var say = onStatus || function () {};
    say("Sign in with the ceramics admin if a box opens.");
    var t = await ensureIdentity();
    var files = [];
    for (var i = 0; i < picked.length; i++) {
      var item = picked[i];
      say("Preparing " + (i + 1) + " of " + picked.length + "…");
      var blob = await toBlob(item.framed);
      var tag = item.framed.width + "x" + item.framed.height;
      var safe = String(item.name || "still").replace(/[^\w.-]+/g, "-");
      files.push({
        path: PREFIX + stamp + "/" + safe + "-" + tag + ".jpg",
        b64: await blobToB64(blob)
      });
    }
    say("Saving " + files.length + " into the GitHub media folder…");
    try {
      await commitAll(files, "Add " + files.length + " studio stills to media.", t);
    } catch (err) {
      say("Saving one picture at a time…");
      for (var j = 0; j < files.length; j++) {
        await putGit(files[j].path, files[j].b64, "Studio still " + (j + 1), t);
      }
    }
    return files.length;
  };

  function pieceTitle(name) {
    var t = String(name || "Piece").replace(/\.[a-z0-9]+$/i, "");
    t = t.replace(/-1920x1080$/i, "").replace(/-1920$/i, "").replace(/[-_]+/g, " ").trim();
    if (!t || t.toLowerCase() === "collection") return "Collection";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  window.pushShareSet = async function (picked, stamp, onStatus) {
    var say = onStatus || function () {};
    say("Sign in with the ceramics admin if a box opens.");
    var t = await ensureIdentity();
    var files = [];
    var pieces = [];
    for (var i = 0; i < picked.length; i++) {
      var item = picked[i];
      say("Preparing " + (i + 1) + " of " + picked.length + "…");
      var blob = await toBlob(item.framed);
      var file = String(i + 1).padStart(2, "0") + ".jpg";
      files.push({ path: "jm-website/images/share/" + stamp + "/" + file, b64: await blobToB64(blob) });
      pieces.push({ file: file, title: pieceTitle(item.name) });
    }
    var manifest = JSON.stringify({ pieces: pieces });
    files.push({
      path: "jm-website/images/share/" + stamp + "/manifest.json",
      b64: btoa(manifest)
    });
    say("Saving the link…");
    try {
      await commitAll(files, "Add client selection " + stamp + ".", t);
    } catch (err) {
      for (var j = 0; j < files.length; j++) {
        await putGit(files[j].path, files[j].b64, "Share " + stamp + " " + (j + 1), t);
      }
    }
    return "https://moriphoto.github.io/jm-website/share.html?set=" + stamp;
  };

  if (window.netlifyIdentity) {
    try { netlifyIdentity.init({ APIUrl: IDENTITY_API }); } catch (e) {}
  }
})();
