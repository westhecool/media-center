async function main() {
    global.Logger = require('./logger.js');
    const path = require('path');
    global.config = {
        log_level: 4
    };
    const logger = new global.Logger('main');
    logger.debug('Loading config...');
    global.config = require('./config.js');
    logger.info('Starting up...');
    logger.debug('Loading modules...');
    const mime = require('mime-types');
    const fs = require('fs');
    const http = require('http');
    const cp = require('child_process');
    await fs.promises.mkdir(process.cwd() + '/data', { recursive: true });
    logger.debug('Loading database...');
    global.database = require('./database.js');
    const scanCollection = require('./collection-scanner.js');
    if (global.config.ffmpeg.enabled) {
        try {
            cp.execSync(config.ffmpeg.path + ' -version');
        } catch (e) {
            logger.warn('ffmpeg not found. Disabling...');
            global.config.ffmpeg.enabled = false;
        }
    }
    if (global.config.ffprobe.enabled) {
        try {
            cp.execSync(config.ffprobe.path + ' -version');
        } catch (e) {
            logger.warn('ffprobe not found. Disabling...');
            global.config.ffprobe.enabled = false;
        }
    }
    logger.debug('Loading filesystem backends...');
    global.fileSystemBackends = {};
    for (const backend of await fs.promises.readdir(__dirname + '/file-system-backends')) {
        const fsb = require(__dirname + '/file-system-backends/' + backend);
        await fsb.init();
        for (const protocol of fsb.supportedProtocols) {
            fileSystemBackends[protocol] = fsb;
        }
    }
    logger.debug('Starting server...');
    await fs.promises.copyFile(global.config.videojs.js_path, __dirname + '/www/video-js.js');
    await fs.promises.copyFile(global.config.videojs.css_path, __dirname + '/www/video-js.css');
    const server = http.createServer(async (req, res) => {
        logger.debug('Request', req.url);
        const url = req.url.split('?')[0];
        var GET = {};
        (req.url.split('?')[1] || '').split('&').forEach(param => {
            GET[decodeURIComponent(param.split('=')[0])] = decodeURIComponent(param.split('=')[1]);
        });
        if (url == '/' || url == '/web') {
            res.writeHead(302, { 'Location': '/web/' });
            res.end();
        } else if (url.startsWith('/web/')) {
            if (fs.existsSync(__dirname + '/www' + url.replace('/web', '')) && fs.lstatSync(__dirname + '/www' + url.replace('/web', '')).isFile()) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(await fs.promises.readFile(__dirname + '/www' + url.replace('/web', ''), 'utf8'));
            } else if (fs.existsSync(__dirname + '/www' + url.replace('/web', '') + '/index.html') && fs.lstatSync(__dirname + '/www' + url.replace('/web', '') + '/index.html').isFile()) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(await fs.promises.readFile(__dirname + '/www' + url.replace('/web', '') + '/index.html', 'utf8'));
            } else {
                res.writeHead(404);
                res.end();
            }
        } else if (url == '/api/all-collection-media') {
            const collection_id = Number(GET['id']);
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
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(await database.fetch(`SELECT * FROM media WHERE collection_id = ?;`, [collection_id])));
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
        } else if (url == '/api/collection-titles') {
            const limit = Number(GET['limit'] || 0);
            const offset = Number(GET['offset'] || 0);
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
            var data = [];
            for (const title of await global.database.fetch(`SELECT * FROM collection_titles WHERE collection_id = ? ${limit ? 'LIMIT ? OFFSET ?' : ''};`, limit ? [id, limit, offset] : [id])) {
                data.push(title.name);
            }
            res.end(JSON.stringify(data));
        } else if (url == '/api/imdb') {
            const id = GET['id'];
            if (!id) {
                res.writeHead(400);
                res.end();
                return;
            }
            const imdb = (await global.database.fetch(`SELECT * FROM imdb WHERE imdb_id = ?;`, [id]))[0];
            if (!imdb) {
                res.writeHead(404);
                res.end();
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(imdb));
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
                file.on('end', () => {
                    res.end()
                });
                res.on('drain', () => {
                    file.resume()
                });
                res.on('close', () => {
                    file.destroy()
                });
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
                file.on('end', () => {
                    res.end()
                });
                res.on('drain', () => {
                    file.resume()
                });
                res.on('close', () => {
                    file.destroy()
                });
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    server.listen(config.http.port, config.http.host, () => {
        logger.info(`Listening on http://${config.http.host}:${config.http.port}`);
        tests();
    });
    async function tests() {
        // tests
        await global.database.exec(`DELETE FROM collection;`);
        await global.database.exec(`INSERT INTO collection VALUES (1, 'file://E:\\hdd3\\jellyfin\\movies', 'movies', true, true, false);`);
        scanCollection(1, false);
        await global.database.exec(`INSERT INTO collection VALUES (2, 'file://E:\\hdd3\\jellyfin\\shows', 'shows', true, true, false);`);
        scanCollection(2, false);
        await global.database.exec(`INSERT INTO collection VALUES (3, 'file://H:\\test-media', 'mixed', true, true, true);`);
        scanCollection(3, false);
        await global.database.exec(`INSERT INTO collection VALUES (4, 'discord:///movies', 'discord', false, false, true);`);
        scanCollection(4, true);
        // end tests
    }
}
module.exports = main;