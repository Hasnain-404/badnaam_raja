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

function getAudioUrl(id) {
    const cached = streamCache.get(id);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.url);
    if (pendingStreams.has(id)) return pendingStreams.get(id);

    const extraction = extractAudioUrl(id, 'web_safari')
        .catch(() => extractAudioUrl(id, 'tv_embedded'))
        .then(url => {
            streamCache.set(id, { url, expiresAt: Date.now() + CACHE_TTL });
            return url;
        })
        .catch(error => {
            console.error(`yt-dlp failed for ${id}: ${error.message}`);
            throw error;
        });

    pendingStreams.set(id, extraction);
    extraction.then(
        () => pendingStreams.delete(id),
        () => pendingStreams.delete(id)
    );
    return extraction;
}

function extractAudioUrl(id, client) {
    const args = [
        '-g',
        '-f', 'bestaudio/best',
        '--no-playlist',
        '--force-ipv4',
        '--remote-components', 'ejs:github',
        '--extractor-args', `youtube:player_client=${client}`
    ];
    if (denoPath) args.push('--js-runtimes', `deno:${denoPath}`);
    if (ytDlpCookiesPath && client === 'web_safari') args.push('--cookies', ytDlpCookiesPath);
    args.push(`https://www.youtube.com/watch?v=${id}`);

    return new Promise((resolve, reject) => {
        execFile(ytDlp, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${client}: ${stderr || error.message}`));
                return;
            }
            const url = stdout.trim().split(/\r?\n/)[0];
            if (!url) {
                reject(new Error(`${client}: yt-dlp returned no audio URL.`));
                return;
            }
            resolve(url);
        });
    });
}

app.use(cors());
app.use(express.static(__dirname));

app.get('/stream/:id', (req, res) => {
    const { id } = req.params;
    if (!VIDEO_ID.test(id)) {
        return res.status(400).json({ error: 'Invalid YouTube video ID.' });
    }

    getAudioUrl(id)
        .then(url => res.json({ url }))
        .catch(() => res.status(502).json({ error: 'Could not extract the audio stream.' }));
});

app.get('/audio/:id', async (req, res) => {
    const { id } = req.params;
    if (!VIDEO_ID.test(id)) {
        return res.status(400).send('Invalid YouTube video ID.');
    }

    try {
        const url = await getAudioUrl(id);
        const headers = {};
        if (req.headers.range) headers.Range = req.headers.range;
        let upstream = await fetch(url, { headers });

        // Signed YouTube URLs can expire while cached; refresh once and retry.
        if (upstream.status === 403 || upstream.status === 410) {
            streamCache.delete(id);
            const freshUrl = await getAudioUrl(id);
            upstream = await fetch(freshUrl, { headers });
        }

        if (!upstream.ok || !upstream.body) {
            return res.status(502).send('Audio source unavailable.');
        }

        res.status(upstream.status);
        for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
            const value = upstream.headers.get(header);
            if (value) res.setHeader(header, value);
        }
        const { Readable } = require('stream');
        Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
        console.error(`Audio proxy failed for ${id}: ${error.message}`);
        res.status(502).send('Could not load audio.');
    }
});

app.listen(PORT, () => {
    console.log(`Audio stream server listening at http://localhost:${PORT}`);
    console.log(`yt-dlp runtime: ${ytDlp}; Deno: ${denoPath ? 'found' : 'missing'}; cookies: ${fs.existsSync(cookiesPath) ? 'found' : 'missing'}`);
});
