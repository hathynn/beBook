# beBook — Frontend

Convert WordPress-hosted novels into EPUB files for offline reading. This is
the single-page React + Vite + TypeScript frontend described in the design
brief: minimal, Notion/GitHub/Vercel-inspired, built around one flow —
**paste URL → analyze → preview → download EPUB with a live-feeling progress panel**.

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS (custom tokens: primary `#FF97D0`, success `#22C55E`, error `#EF4444`, 16px radius, Inter)
- TanStack Query for server state (`useNovelInfo` mutation)
- Axios for REST calls
- Lucide React for icons
- React Hot Toast for notifications

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api/*` requests
to `http://localhost:4000` (see `vite.config.ts`) — point that at your
Express backend, or change the `target` if it runs elsewhere.

```bash
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build locally
```

## Project structure

```
src/
  api/client.ts             axios instance + typed API calls
  components/                Header, UrlInput, AnalyzeButton, NovelPreviewCard,
                              MetadataCard, SummaryCard, ProgressPanel,
                              DownloadButton, ToastNotification, Footer
  hooks/
    useNovelInfo.ts          TanStack Query mutation -> POST /api/novel/info
    useDownloadEpub.ts       calls POST /api/novel/download, simulates the
                              progress panel locally while the request is in
                              flight, resolves to a downloadable blob
  types/novel.ts             shared request/response + progress types
  App.tsx                    composes the single-page flow
```

## Expected backend API contract

Only two endpoints are needed — there is no job-id / polling endpoint. The
backend does the crawling + EPUB build synchronously and streams the file
back when it's done.

### `POST /api/novel/info`

Request: `{ "url": "https://example.com/novel/some-title/" }`

Response (`NovelInfo`):

```json
{
  "title": "Some Title",
  "author": "Some Author",
  "source": "example.com",
  "status": "Ongoing",
  "coverUrl": "https://example.com/cover.jpg",
  "summary": "...",
  "chapterCount": 120
}
```

### `POST /api/novel/download`

Request: `{ "url": "...", "novel": { ...NovelInfo } }`

This call is expected to **block until the EPUB is fully built**, then
respond with the file itself:

- `Content-Type: application/epub+zip`
- `Content-Disposition: attachment; filename="Some Title.epub"`
- Body: the raw `.epub` bytes

The frontend sends this request with `responseType: "blob"` and `timeout: 0`
(no timeout) since generation can take a while for long novels, and turns
the response into a downloadable object URL on success.

**On failure**, respond with a non-2xx status and a JSON body:

```json
{ "message": "Failed while downloading chapter 37." }
```

The frontend reads this message back out of the error response (even though
it requested a blob) and shows it in the red error panel, with a Retry
button that resends the same request.

## How the progress panel works without backend progress events

Since the backend has no way to report incremental progress, `useDownloadEpub`
simulates it client-side:

1. On click, it starts a local ticker that advances a percentage and walks
   through the 7 step labels (Novel info → Chapter list → Downloading
   chapters → Cleaning HTML → Building EPUB → Packaging EPUB → Finished),
   slowing down as it approaches a 96% cap so it never visually completes
   before the real request does.
2. When `POST /api/novel/download` resolves, the ticker stops and the panel
   snaps to 100% / all steps done / green, and the button becomes
   "Download Again" linking to the in-memory blob.
3. If the request rejects, the ticker stops immediately, the panel turns
   red with the backend's error message (or a generic fallback), and a
   Retry button appears.

If you later add real backend progress (e.g. via SSE or WebSockets), swap
the ticker logic in `useDownloadEpub.ts` for real event handling — the
`JobProgress` shape it produces is unchanged either way, so `ProgressPanel`
needs no changes.
