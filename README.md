# Studio Stills

Side project for [John Mackenzie Ceramics](https://jmceramics.netlify.app). Not the live site.

Any JPEG in → ceramic + shadow cut out → sat on a **1920 × 1080** cove → JPEG out.
Glaze stays as shot. Gemini 2.5 Flash comes later for the mask (key never in this repo).

## Live preview (free, no Netlify)

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / folder: **/ (root)** → Save

Then open:

https://moriphoto.github.io/studio-stills/

Processing runs in your browser. GitHub only hosts the HTML. No Netlify credits.

## Files

| File | Role |
|---|---|
| `index.html` | The tool |
| `studio.js` | Cut, place, 1920×1080 export |
| `GEMINI-PROMPT.txt` | Mask prompt for later |
