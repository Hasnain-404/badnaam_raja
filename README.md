# Badnaam Raja

Public web music player for King's playlists.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The server needs `yt-dlp` available on the host PATH for audio URL extraction. The Electron desktop application files are not included in this repository.

## Render deployment

Use the included `render.yaml`, or set:

```text
Build command: npm install && pip install yt-dlp && curl -fsSL https://deno.land/install.sh | sh
Start command: npm start
```

If YouTube still asks for bot verification from the hosting IP, configure a private `YOUTUBE_COOKIES_FILE` secret file on the server. Never commit cookies or database credentials.
