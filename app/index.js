/*const yargs = require('yargs');
global.args = yargs
.option('log-level', { type: 'number', default: 1, description: 'Log level. 0 = debug, 1 = info, 2 = warn, 3 = error, 4 = silent' })
.parse();*/
const Logger = require('./logger.js');
const path = require('path');
global.config = {
    log_level: 4
};
const logger = new Logger(path.basename(__filename));
//logger.debug('Loading config...');
global.config = require('./config.js');
logger.info('Starting up...');
//logger.debug('Args:', global.args);
const fs = require('fs');
fs.mkdirSync(process.cwd() + '/data', { recursive: true });
const http = require('http');
logger.debug('Loading filesystem backends...');
global.fileSystemBackends = {};
for (const backend of fs.readdirSync(__dirname + '/file-system-backends')) {
    const fsb = require(__dirname + '/file-system-backends/' + backend);
    for (const protocol of fsb.supportedProtocols) {
        fileSystemBackends[protocol] = fsb;
    }
}
logger.debug('Loading database...');
global.database = require('./database.js');
const scanCollection = require('./collection-scanner.js');
// tests
global.database.exec(`DELETE FROM collection;`).then(() => {
    global.database.exec(`INSERT INTO collection VALUES (1, 'file://E:\\hdd3\\jellyfin\\movies', 'movies', true, true, false);`).then(() => {
        scanCollection(1, false);
    });
    global.database.exec(`INSERT INTO collection VALUES (2, 'file://E:\\hdd3\\jellyfin\\shows', 'shows', true, true, false);`).then(() => {
        scanCollection(2, false);
    });
    global.database.exec(`INSERT INTO collection VALUES (3, 'file://H:\\test-media', 'mixed', true, true, true);`).then(() => {
        scanCollection(3, false);
    });
});
// end tests
if (config.ffmpeg.enabled) {
    try {
        cp.execSync(config.ffmpeg.path + ' -version');
    } catch (e) {
        logger.warn('ffmpeg not found. Disabling...');
        config.ffmpeg.enabled = false;
    }
}
if (config.ffprobe.enabled) {
    try {
        cp.execSync(config.ffprobe.path + ' -version');
    } catch (e) {
        logger.warn('ffprobe not found. Disabling...');
        config.ffprobe.enabled = false;
    }
}
const mime = require('mime-types');
logger.debug('Starting server...');
const server = http.createServer(async (req, res) => {
    logger.debug('Request', req.url);
    const url = req.url.split('?')[0];
    var GET = {};
    (req.url.split('?')[1] || '').split('&').forEach(param => {
        GET[decodeURIComponent(param.split('=')[0])] = decodeURIComponent(param.split('=')[1]);
    });
    if (url == '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
    } else if (url == '/api/all-collections-media') {
        const limit = Number(GET['limit'] || 0);
        const offset = Number(GET['offset'] || 0);
        var data = [];
        for (const collection of (await global.database.fetch(`SELECT * FROM collection;`))) {
            const args = limit ? [collection.id, limit, offset] : [collection.id];
            data.push({
                id: collection.id,
                name: collection.name,
                media: await database.fetch(`SELECT * FROM media WHERE collection_id = ? AND ((type = 'movie') OR (type = 'episode' AND episode = 1 AND season = 1)) ORDER BY added_on DESC ${limit ? `LIMIT ? OFFSET ?` : ''};`, args)
            });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } else if (url == '/api/collection-media') {
        const limit = Number(GET['limit'] || 0);
        const offset = Number(GET['offset'] || 0);
        const collection_id = Number(GET['collection']);
        if (!collection_id) {
            res.writeHead(400);
            res.end();
            return;
        }
        const collection = (await global.database.fetch(`SELECT * FROM collection WHERE id = ?;`, [collection_id]))[0];
        if (!collection) {
            res.writeHead(404);
            res.end();
            return;
        }
        const args = limit ? [collection_id, limit, offset] : [collection_id];
        var data = {
            id: collection.id,
            name: collection.name,
            media: await database.fetch(`SELECT * FROM media WHERE collection_id = ? AND ((type = 'movie') OR (type = 'episode' AND episode = 1 AND season = 1)) ORDER BY added_on DESC ${limit ? `LIMIT ? OFFSET ?` : ''};`, args)
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    } else if (url == '/api/collections') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(await global.database.fetch(`SELECT * FROM collection;`)));
    } else if (url == '/api/media') {
        const id = Number(GET['id'] || 0);
        if (!id) {
            res.writeHead(400);
            res.end();
            return;
        }
        const media = (await global.database.fetch(`SELECT * FROM media WHERE id = ?;`, [id]))[0];
        if (!media) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(media));
    } else if (url == '/api/medias-by-imdb-id') {
        const id = GET['id'];
        if (!id) {
            res.writeHead(400);
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(await global.database.fetch(`SELECT * FROM media WHERE imdb_id = ?;`, [id])));
    } else if (url.startsWith('/stream/')) {
        const id = decodeURI(url.split('/')[2].split('.')[0]);
        if (!id) {
            res.writeHead(404);
            res.end();
            return;
        }
        const media = (await global.database.fetch(`SELECT * FROM media WHERE id = ?;`, [id]))[0];
        if (!media) {
            res.writeHead(404);
            res.end();
            return;
        }
        const ext = path.extname(media.path.split('://')[1]);
        if (ext != path.extname(url)) { // help the browser play file
            res.writeHead(302, {
                'Location': path.dirname(url) + '/' + path.basename(url, path.extname(url)) + ext
            });
            res.end();
            return;
        }
        if (!global.fileSystemBackends.hasOwnProperty(media.path.split('://')[0])) {
            logger.warn('Unsupported protocol', media.path.split('://')[0]);
            res.writeHead(500);
            res.end();
            return;
        }
        if (req.headers.range) {
            const parts = req.headers.range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : media.size - 1;
            if (start >= media.size) {
                res.writeHead(416, { // Range Not Satisfiable
                    'Content-Range': `bytes */${media.size}`,
                    'Content-Length': 0,
                    'Content-Type': mime.lookup(url) || 'application/octet-stream',
                    'Accept-Ranges': 'bytes'
                });
                res.end();
                return;
            }

            const chunksize = (end - start) + 1;
            res.writeHead(206, { // Partial Content
                'Content-Range': `bytes ${start}-${end}/${media.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': mime.lookup(url) || 'application/octet-stream'
            });
            const file = await global.fileSystemBackends[media.path.split('://')[0]].readStream(media.path, start, end);
            file.on('data', (chunk) => {
                if (!res.write(chunk)) file.pause();
            });
            file.on('end', () => res.end());
            res.on('drain', () => file.resume());
            res.on('close', () => file.destroy());
        } else {
            res.writeHead(200, {
                'Accept-Ranges': 'bytes',
                'Content-Length': media.size,
                'Content-Type': mime.lookup(url) || 'application/octet-stream'
            });
            const file = await global.fileSystemBackends[media.path.split('://')[0]].readStream(media.path);
            file.on('data', (chunk) => {
                if (!res.write(chunk)) file.pause();
            });
            file.on('end', () => res.end());
            res.on('drain', () => file.resume());
            res.on('close', () => file.destroy());
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});
server.listen(config.http.port, config.http.host, () => {
    logger.info(`Listening on http://${config.http.host}:${config.http.port}`);
});