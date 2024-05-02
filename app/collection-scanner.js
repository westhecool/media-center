const Logger = require('./logger.js');
const path = require('path');
const utills = require('./utills.js');
const logger = new Logger(path.basename(__filename));
async function scanCollection(collection) {
    const info = (await global.databese.fetch(`SELECT * FROM collection WHERE name = '${collection}'`))[0];
    if (!info) {
        logger.warn(`Error while scanning collection "${collection}": Collection not found.`);
        return;
    }
    const protocol = info.path.split('://')[0];
    if (!global.fileSystemBackends.hasOwnProperty(protocol)) {
        logger.error(`Error while scanning collection "${collection}": Protocol "${protocol}://" is not supported!`);
        return;
    }
    for (const filename of await global.fileSystemBackends[protocol].readDir(info.path)) {
        const stats = await global.fileSystemBackends[protocol].stat(info.path + '/' + filename);
        if (!stats.isDirectory) {
            const media_info = (await global.databese.fetch(`SELECT * FROM media WHERE path = '${info.path}/${filename}'`))[0];
            if (!media_info || media_info.mtime != stats.mtime || media_info.size != stats.size) {
                logger.debug('Scanning', info.path + '/' + filename);
                // id integer primary key autoincrement, path text, imdb_id text, stream_title text, name text, year integer, type text, file_type text, stream_language text, size integer, mtime date
                const year = filename.match(/\(\d{4}\)/);
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
                    logger.warn(`Error while scanning collection "${collection}": Unsupported file extension "${ext}" for file "${info.path}/${filename}".`);
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
                const d = [info.path + '/' + filename, null, stream_title, name, year, type, file_type, language, stats.size, stats.mtime];
                if (!media_info) await global.databese.exec(`INSERT INTO media VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d);
                else {
                    await global.databese.exec(`UPDATE media SET path = ?, imdb_id = ?, stream_title = ?, name = ?, year = ?, type = ?, file_type = ?, stream_language = ?, size = ?, mtime = ? WHERE id = '${media_info.id}'`, d);
                }
            }
        }
    }
    for (const media of await global.databese.fetch(`SELECT * FROM media WHERE path LIKE '${info.path}/%'`)) {
        if (!await global.fileSystemBackends[protocol].exists(media.path)) {
            await global.databese.exec(`DELETE FROM media WHERE id = '${media.id}'`);
            logger.debug('Deleting', media.path, 'from database (not found on disk anymore)');
        }
    }
}
global.databese.exec(`INSERT OR IGNORE INTO collection VALUES (NULL, 'file://C:\\Users\\WEuge\\Documents\\GitHub\\media-center\\test-media', 'test')`).then(() => {
    scanCollection('test');
});