const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const bundledYtDlp = path.join(__dirname, 'bin', 'yt-dlp.exe');
const parentYtDlp = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');
const availableYtDlp = fs.existsSync(bundledYtDlp) ? bundledYtDlp : parentYtDlp;
const ytDlp = fs.existsSync(availableYtDlp) ? availableYtDlp : 'yt-dlp';
const cookiesPath = process.env.YOUTUBE_COOKIES_FILE || '/etc/secrets/youtube-cookies.txt';
const writableCookiesPath = '/tmp/youtube-cookies.txt';
const denoCandidates = [
    process.env.DENO_PATH,
    '/opt/render/project/.deno/bin/deno',
    '/opt/render/project/src/.deno/bin/deno',
    '/root/.deno/bin/deno',
    '/usr/local/bin/deno'
].filter(Boolean);
const denoPath = denoCandidates.find(candidate => fs.existsSync(candidate));
let ytDlpCookiesPath = null;
if (fs.existsSync(cookiesPath)) {
    try {
        fs.copyFileSync(cookiesPath, writableCookiesPath);
        ytDlpCookiesPath = writableCookiesPath;
    } catch (error) {
        console.error('Could not prepare cookies file for yt-dlp:', error.message);
    }
}
const streamCache = new Map();
const pendingStreams = new Map();
const CACHE_TTL = 5 * 60 * 1000;

app.use(cors());
app.use(express.static(__dirname));

app.get('/stream/:id', (req, res) => {
    const { id } = req.params;
    if (!VIDEO_ID.test(id)) {
        return res.status(400).json({ error: 'Invalid YouTube video ID.' });
    }

    const cached = streamCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
        return res.json({ url: cached.url });
    }

    if (pendingStreams.has(id)) {
        return pendingStreams.get(id)
            .then(url => res.json({ url }))
            .catch(() => res.status(502).json({ error: 'Could not extract the audio stream.' }));
    }

    const args = [
        '-g',
        '-f', 'ba',
        '--no-playlist',
        '--extractor-args', 'youtube:player_client=web_safari'
    ];
    if (denoPath) args.push('--js-runtimes', `deno:${denoPath}`);
    if (ytDlpCookiesPath) args.push('--cookies', ytDlpCookiesPath);
    args.push(`https://www.youtube.com/watch?v=${id}`);

    const extraction = new Promise((resolve, reject) => {
        execFile(ytDlp, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`yt-dlp failed for ${id}:`, stderr || error.message);
                reject(error);
                return;
            }

            const url = stdout.trim().split(/\r?\n/)[0];
            if (!url) {
                reject(new Error('yt-dlp returned no audio URL.'));
                return;
            }

            streamCache.set(id, { url, expiresAt: Date.now() + CACHE_TTL });
            resolve(url);
        });
    });
    pendingStreams.set(id, extraction);
    extraction.then(
        () => pendingStreams.delete(id),
        () => pendingStreams.delete(id)
    );
    extraction.then(url => res.json({ url })).catch(() => res.status(502).json({ error: 'Could not extract the audio stream.' }));
});

app.listen(PORT, () => {
    console.log(`Audio stream server listening at http://localhost:${PORT}`);
    console.log(`yt-dlp runtime: ${ytDlp}; Deno: ${denoPath ? 'found' : 'missing'}; cookies: ${fs.existsSync(cookiesPath) ? 'found' : 'missing'}`);
});
