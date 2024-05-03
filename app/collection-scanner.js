const Logger = require('./logger.js');
const path = require('path');
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
    }
    const protocol = info.path.split('://')[0];
    if (!global.fileSystemBackends.hasOwnProperty(protocol)) {
        logger.error(`Error while scanning collection "${collection}": Protocol "${protocol}://" is not supported!`);
        return;
    }
    for (const filename of await global.fileSystemBackends[protocol].readDir(info.path)) {
        const stats = await global.fileSystemBackends[protocol].stat(info.path + '/' + filename);
        if (!stats.isDirectory) {
            const media_info = (await global.database.fetch(`SELECT * FROM media WHERE path = '${info.path}/${filename}'`))[0];
            if (!media_info || media_info.mtime != stats.mtime || media_info.size != stats.size) {
                logger.debug('Scanning', info.path + '/' + filename);
                // id integer primary key autoincrement, path text, imdb_id text, stream_title text, name text, year integer, type text, file_type text, stream_language text, size integer, mtime date
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
                const match = name.match(/\d{4}/);
                const year = match ? match[0] : null;
                const q = await imdb.search(name);
                const imdb_id = q[0] ? q[0].id : null;
                logger.debug('Identified', info.path + '/' + filename, 'as', q[0] ? q[0].id : null, q[0] ? q[0].title : null, `(${q[0] ? q[0].year : null})`);
                await imdb.get(imdb_id); // add imdb info to the database for good measure
                const d = [info.path + '/' + filename, imdb_id, stream_title, name, year, type, file_type, language, stats.size, stats.mtime, collection_id];
                if (!media_info) await global.database.exec(`INSERT INTO media VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d);
                else {
                    await global.database.exec(`UPDATE media SET path = ?, imdb_id = ?, stream_title = ?, name = ?, year = ?, type = ?, file_type = ?, stream_language = ?, size = ?, mtime = ?, collection_id = ? WHERE id = '${media_info.id}'`, d);
                }
            }
        }
    }
    for (const media of await global.database.fetch(`SELECT * FROM media WHERE collection_id = '${collection_id}'`)) {
        if (!await global.fileSystemBackends[protocol].exists(media.path)) {
            await global.database.exec(`DELETE FROM media WHERE id = ${media.id}`);
            logger.debug('Deleting', media.path, 'from database (not found on disk anymore)');
        }
    }
}
global.database.exec(`INSERT OR IGNORE INTO collection VALUES (NULL, 'file://C:\\Users\\WEuge\\Documents\\GitHub\\media-center\\test-media', 'test', true, true)`).then(() => {
    scanCollection(1, true);
});