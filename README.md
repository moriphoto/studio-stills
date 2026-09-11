# Studio Stills

Side project for [John Mackenzie Ceramics](https://jmceramics.netlify.app). Not the live site.

Live tool: https://moriphoto.github.io/studio-stills/

Any JPEG in → ceramic + shadow cut out → sat on a **1920 × 1080** cove → JPEG out.
Processing runs in your browser. No Netlify credits.

## How it will join the ceramics admin (later)

**Now:** this repo stays separate. John can bookmark the link above.

**Next (one Netlify deploy, when credits allow):** a **Studio Stills** button in Decap admin that opens this page in a new window.

**After that:** tick media in admin → Open in Studio. Admin sends the image URLs:

```
https://moriphoto.github.io/studio-stills/?images=https://jmceramics.netlify.app/media/pot.jpg,https://jmceramics.netlify.app/media/bowl.jpg
```

Studio loads those stills into the tray. Process all as usual. Download 1920s, drop them back into Media.

Best long-term: copy this tool to `/studio/` on the ceramics site so everything is same-origin. Not until stills look right.

Gemini 2.5 Flash stays off until a `GEMINI_API_KEY` is added. Never put the key in this repo.
