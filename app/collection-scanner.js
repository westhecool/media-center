const Logger = require('./logger.js');
const path = require('path');
const cp = require('child_process');
const utills = require('./utills.js');
const logger = new Logger(path.basename(__filename));
const imdb = require('./imdb.js');
async function scanCollection(collection_id, full_rescan = false) {
    const info = (await global.database.fetch(`SELECT * FROM collection WHERE id = '${collection_id}'`))[0];
    if (!info) {
        logger.warn(`Error while scanning collection "${collection_id}": Collection not found.`);
        return;
    }
    logger.debug('Scanning collection', collection_id, info.name);
    if (full_rescan) {
        logger.debug('Full rescan for collection', collection_id);
        await global.database.exec(`DELETE FROM media WHERE collection_id = ${collection_id}`);
        await global.database.exec(`DELETE FROM media_probes WHERE collection_id = ${collection_id}`);
    }
    const protocol = info.path.split('://')[0];
    if (!global.fileSystemBackends.hasOwnProperty(protocol)) {
        logger.error(`Error while scanning collection "${collection_id}": Protocol "${protocol}://" is not supported!`);
        return;
    }
    if (!await global.fileSystemBackends[protocol].exists(info.path)) {
        logger.error(`Error while scanning collection "${collection_id}": Path "${info.path}" does not exist!`);
        return;
    }
    for (const filename of await global.fileSystemBackends[protocol].readDir(info.path)) {
        const stats = await global.fileSystemBackends[protocol].stat(info.path + '/' + filename);
        if (!stats.isDirectory) {
            const media_info = (await global.database.fetch(`SELECT * FROM media WHERE path = '${info.path}/${filename}'`))[0];
            if (!media_info || media_info.mtime != stats.mtime || media_info.size != stats.size) {
                logger.debug('Scanning', info.path + '/' + filename);
                const s = filename.split('.');
                var language = null;
                var file_type = null;
                var type = 'movie';
                var stream_title = null;
                var name = null;
                const ext = s[s.length - 1];
                if (ext == 'mp4' || ext == 'webm') {
                    file_type = 'video';
                } else if (ext == 'vtt') {
                    file_type = 'subtitle';
                } else if (ext == 'mp3' || ext == 'm4a') {
                    file_type = 'audio';
                } else {
                    logger.warn(`Error while scanning collection "${info.name}": Unsupported file extension "${ext}" for file "${info.path}/${filename}".`);
                    continue;
                }
                if (s.length == 3) { // file name (year).(language).(ext)
                    name = s[0];
                    language = utills.convertToTwoLetterCode(s[1]);
                } else if (s.length == 4) { // file name (year).(stream title).(language).(ext)
                    name = s[0];
                    stream_title = s[1];
                    language = utills.convertToTwoLetterCode(s[2]);
                } else { // file name (year).(ext)
                    name = s[0];
                }
                const q = await imdb.search(name);
                const imdb_id = q[0] ? q[0].id : null;
                const match = name.match(/\d{4}/);
                const year = q[0] ? q[0].year : (match ? match[0] : null); // use year from imdb if possible else use year from filename if possible
                logger.debug('Identified', info.path + '/' + filename, 'as', q[0] ? q[0].id : null, q[0] ? q[0].title : null, `(${q[0] ? q[0].year : null})`);
                await imdb.get(imdb_id); // add imdb info to the database for good measure
                const d = [info.path + '/' + filename, imdb_id, stream_title, name, year, type, file_type, language, stats.size, stats.mtime, collection_id];
                if (!media_info) await global.database.exec(`INSERT INTO media VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d);
                else {
                    await global.database.exec(`UPDATE media SET path = ?, imdb_id = ?, stream_title = ?, name = ?, year = ?, type = ?, file_type = ?, stream_language = ?, size = ?, mtime = ?, collection_id = ? WHERE id = '${media_info.id}'`, d);
                }
                if (info.allow_media_probe) {
                    await new Promise((resolve, reject) => {
                        // TODO: make ffprobe use the http server instead of the file system
                        cp.exec(`.\\data\\ffprobe -v error -print_format json -show_format -show_streams -show_chapters "${info.path.replace('file://', '').replace(/\"/g, '\\"')}/${filename.replace(/\"/g, '\\"')}"`, async (err, stdout, stderr) => {
                            if (!err) {
                                const data = JSON.stringify(JSON.parse(stdout));
                                await global.database.exec(`INSERT INTO media_probes VALUES (NULL, ?, ?, ?)`, [info.path + '/' + filename, data, collection_id]);
                            } else {
                                logger.error(`Error while probing "${info.name}/${filename}": ${stderr} - ${err.message}`);
                            }
                            resolve();
                        });
                    });
                }
            }
        }
    }
    for (const media of await global.database.fetch(`SELECT * FROM media WHERE collection_id = ${collection_id}`)) {
        if (!await global.fileSystemBackends[protocol].exists(media.path)) {
            await global.database.exec(`DELETE FROM media WHERE id = ${media.id}`);
            logger.debug('Deleting', media.path, 'from database (not found on disk anymore)');
        }
    }
    for (const media_probe of await global.database.fetch(`SELECT * FROM media_probes WHERE collection_id = ${collection_id}`)) {
        if (!await global.fileSystemBackends[protocol].exists(media_probe.path)) {
            await global.database.exec(`DELETE FROM media_probes WHERE id = ${media_probe.id}`);
            logger.debug('Deleting', media_probe.path, 'from probe database (not found on disk anymore)');
        }
    }
    logger.debug('Finished scanning collection', collection_id);
}
global.database.exec(`DELETE FROM collection`).then(() => {
    global.database.exec(`INSERT INTO collection VALUES (1, 'file://H:\\test-media', 'test', true, true)`).then(() => {
        scanCollection(1, true);
    });
})