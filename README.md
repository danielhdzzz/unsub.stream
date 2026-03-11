# unsub.stream

Browse & explore your exported Spotify data. Zero dependencies, pure HTML/CSS/JS — nothing to install, nothing to build. All processing happens in your browser — your data never leaves your machine.

## Getting Your Data

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and log in
2. Scroll to "Download your data" and request your data (the **Account data** package — not Extended streaming history)
3. Spotify will email you when it's ready (usually a few days)
4. Download and unzip the file — you'll get a folder containing `YourLibrary.json` and one or more `Playlist1.json`, `Playlist2.json`, etc.

## Usage

Visit [unsub.stream](https://unsub.stream) and drop your Spotify export folder (or the JSON files inside it) onto the upload area. You can also click to select files manually. Your data is processed entirely in the browser and is never sent anywhere.

After the first upload, your data is cached locally in your browser (IndexedDB) so the app loads instantly on return visits — no need to re-upload. You can clear the cache from Settings.

### Running locally (optional)

You can also clone the repo and place your exported JSON files into a `data/` folder next to `index.html`. The app detects the folder and loads your data automatically.

```
git clone <repo-url>
cd unsub.stream
mkdir data
cp ~/Downloads/my_spotify_data/*.json data/
python3 -m http.server 8888
```

Then open http://localhost:8888.

> A local server is needed because browsers block file loading from `file://` URLs for security reasons.

## Features

- **Playlists & Liked Songs** — browse every playlist and your full liked songs library
- **Artists & Albums** — deduplicated index of every artist and album across your library, sorted by track count
- **Search & Filter** — filter playlists in the sidebar (`Cmd+K`) or tracks in the current view (`Cmd+F`)
- **Sorting** — click any column header to sort by title, artist, album, or date added
- **Deduplication** — toggle "hide duplicates" to collapse cross-playlist repeats
- **Stats** — library overview with unique track/artist/album counts, top artists, top albums, timeline of tracks added per month, and new artist discoveries
- **Wrapped** — Support for Wrapped 2025 to see your year in review: top tracks, listening highlights, notable days, artist race, and more (support for other years coming soon)
- **Export** — export individual playlists or your entire library as TXT (plain text, one track per line) or CSV (compatible with Soundiiz, TuneMyMusic, and other transfer tools)
- **Settings** — hide local tracks (stored files not on Spotify) from all views and stats; persisted in localStorage
- **Privacy** — no data collection, no cookies, no analytics, no servers

## Keyboard Shortcuts

- `Cmd+K` — Focus playlist search
- `Cmd+F` — Focus track search
- `Esc` — Close popup / clear and unfocus active search
