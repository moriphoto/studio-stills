/* Last good engine (62c2cc8). Fake ellipse off. Real foot shadow stays. */
(function loadStudio() {
  const SRC = "https://cdn.jsdelivr.net/gh/moriphoto/studio-stills@62c2cc8b2bcad7c295651534e608064c966eff05/studio.js";
  const xhr = new XMLHttpRequest();
  xhr.open("GET", SRC, false);
  xhr.send();
  if (xhr.status < 200 || xhr.status >= 300 || !xhr.responseText) {
    throw new Error("Could not load studio engine");
  }
  const code = xhr.responseText.replace(
    /function paintSit\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
    "function paintSit(){}"
  );
  (0, eval)(code);
  window.paintSit = function paintSit() {};
})();
