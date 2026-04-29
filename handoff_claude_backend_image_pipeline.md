# Claude Handoff: Backend WebP Image Pipeline

## Goal

Josue wants all admin image uploads to be converted to WebP before they enter Supabase Storage, because storage space matters. There must be no fallback that uploads the original image. If conversion fails, the app should show an error and no original image should be stored.

## Current State

I replaced the browser Canvas conversion path with a backend Electron main-process image pipeline using `sharp`.

The app is an Electron desktop app at:

```text
M:\miniBIOTA\miniBIOTA_App
```

Uploads now flow like this:

```text
Admin UI file input
-> renderer reads file.arrayBuffer()
-> preload IPC bridge
-> Electron main process
-> services/image-upload.js
-> sharp converts to WebP
-> upload WebP only to Supabase Storage
-> renderer receives success/error
-> admin.js writes DB references only after upload succeeds
```

## Files Changed

- `services/image-upload.js`
  - New backend image service.
  - Uses `sharp`.
  - Whitelists buckets: `images`, `chronicles-images`.
  - Max upload size: `50 MB`.
  - Max input pixels: `80,000,000`.
  - Converts to WebP with max dimension `1600px`, quality `82`.
  - Uses `.rotate()` for EXIF orientation.
  - Strips metadata by default because no metadata preservation is requested.
  - Uploads to Supabase Storage with `Content-Type: image/webp`.
  - Returns metadata: original format, dimensions, original bytes, WebP bytes, compression ratio, SHA-256 hash.

- `main.js`
  - Imports `processAndUploadImage`.
  - Adds IPC handler: `image-upload-webp`.

- `preload.js`
  - Exposes `window.electronAPI.uploadImageWebP(payload)`.

- `js/admin.js`
  - Removed browser Canvas `admConvertToWebP`.
  - `admUploadToStorage()` now calls the backend IPC pipeline.
  - No original fallback remains.
  - Conversion/upload failure shows a status error and returns `null`.
  - Species image linking now returns `true/false`.
  - Biome, biosphere, and chronicle image saves stop if image conversion/upload fails.
  - Added cleanup: if a WebP uploads successfully but the follow-up database write fails, the app deletes that newly uploaded file to avoid orphaned bucket objects.

- `js/config.js`
  - Added guarded CommonJS export:

```js
if (typeof module !== "undefined") {
  module.exports = { SUPABASE_URL, SUPABASE_KEY, HEADERS };
}
```

  - This lets `services/image-upload.js` reuse the existing Supabase constants from Electron main while keeping browser behavior intact.

- `package.json`
  - Added dependency: `sharp`.
  - Added `services/**` to `build.files` so the new backend service is included in packaged builds.

- `package-lock.json`
  - Updated by `npm.cmd install`.

- `CLAUDE.md`
  - Updated file structure and image upload technical notes.

## Commands Already Run

Dependency install:

```powershell
npm.cmd install
```

Verification:

```powershell
node --check .\services\image-upload.js
node --check .\main.js
node --check .\preload.js
node --check .\js\admin.js
npm.cmd ls sharp
```

Conversion smoke test, no Supabase write:

```powershell
node -e "const sharp=require('sharp'); const {convertToWebP}=require('./services/image-upload'); sharp({create:{width:20,height:10,channels:3,background:'#6699cc'}}).png().toBuffer().then(buf=>convertToWebP(buf)).then(r=>{console.log(r.buffer.length > 0, r.metadata.originalFormat, r.metadata.originalWidth, r.metadata.originalHeight, r.metadata.webpBytes > 0);})"
```

Observed output:

```text
true png 20 10 true
```

Installed dependency check showed:

```text
sharp@0.34.5
```

## Not Yet Tested

I did **not** run a real upload into Supabase Storage, because that writes to the live project. Claude should do this only with Josue's approval or with a disposable test record/image.

Recommended real test:

1. Run:

```powershell
npm.cmd start
```

2. Open Site Admin.
3. Upload a small disposable JPG/PNG to a test species, biome, biosphere profile, or chronicle.
4. Confirm the app status says something like:

```text
Image converted to WebP and uploaded (1234 KB -> 218 KB).
```

5. Confirm Supabase Storage contains a `.webp` file in the correct bucket:
   - `images` for species, biomes, biosphere
   - `chronicles-images` for chronicles

6. Confirm the corresponding database reference points to the `.webp` filename or URL.

## Important Follow-Up Checks

Please verify these before declaring this fully done:

- `npm.cmd start` works with `sharp` loaded from Electron main.
- Real admin upload succeeds to Supabase Storage.
- Failed conversion shows a clear error and does not upload the original file.
- Failed database write after a successful upload removes the newly uploaded WebP.
- `npm run build` still packages successfully with `sharp`.
- If packaged build fails or the packaged app cannot load `sharp`, add the appropriate electron-builder native module handling, likely `asarUnpack` for sharp/native binaries.

## Current Git State When Handoff Was Created

Expected modified/untracked files:

```text
 M CLAUDE.md
 M js/admin.js
 M js/config.js
 M main.js
 M package-lock.json
 M package.json
 M preload.js
?? services/
?? handoff_claude_backend_image_pipeline.md
```

There were also git warnings about access to:

```text
C:\Users\gimbo\.config\git\ignore
```

That warning appears unrelated to the image upload work.

## Design Notes

The current solution keeps the "backend" inside Electron instead of creating a separate server. That is intentional: this app is an internal desktop tool, already has service-role Supabase access, and already uses Electron IPC for backend-ish work like media indexing and MQTT. This gives stronger image conversion than browser Canvas without adding a deployable service yet.

If miniBIOTA later needs mobile/PWA uploads, this Electron backend will not cover that. At that point, the same logic should move into a real hosted backend endpoint or Supabase Edge Function-compatible image-processing service. For the desktop admin app, the Electron main-process backend is the simplest full-featured backend path.

