const Logger = require('./logger.js');
const path = require('path');
const cp = require('child_process');
const utils = require('./utils.js');
const logger = new Logger(path.basename(__filename));
const imdb = require('./imdb.js');
async function scanCollection(collection_id, full_rescan = false) {
    const info = (await global.database.fetch(`SELECT * FROM collection WHERE id = '${collection_id}'`))[0];
    if (!info) {
        logger.warn(`Error while scanning collection ${collection_id}: Collection not found.`);
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
        logger.error(`Error while scanning collection ${collection_id}: Protocol "${protocol}://" is not supported!`);
        return;
    }
    if (!await global.fileSystemBackends[protocol].exists(info.path)) {
        logger.error(`Error while scanning collection ${collection_id}: Path "${info.path}" does not exist!`);
        return;
    }
    const scan = async (file, stats, is_show = false) => {
        const media_info = (await global.database.fetch(`SELECT * FROM media WHERE path = '${file}'`))[0];
        if (!media_info || media_info.mtime != stats.mtime || media_info.size != stats.size) {
            logger.debug('Scanning', file);
            var language = null;
            var file_type = null;
            var type = 'movie';
            var stream_title = null;
            var name = null;
            var season = null;
            var episode = null;
            if (info.use_custom_naming_format) {
                const s = path.basename(file).split('.');
                const ext = path.extname(file).toLowerCase();
                if (ext == '.mp4' || ext == '.webm') {
                    file_type = 'video';
                } else if (ext == '.vtt') {
                    file_type = 'subtitle';
                } else if (ext == '.mp3' || ext == '.m4a') {
                    file_type = 'audio';
                } else {
                    logger.warn(`Error while scanning collection ${collection_id}: Unsupported file extension "${ext}" for file "${file}".`);
                    return;
                }
                if (s.length == 3) { // file name (year).(language).(ext)
                    name = s[0];
                    language = utils.convertToTwoLetterCode(s[1]);
                } else if (s.length == 4) { // file name (year).(stream title).(language).(ext)
                    name = s[0];
                    stream_title = s[1];
                    language = utils.convertToTwoLetterCode(s[2]);
                } else { // file name (year).(ext)
                    name = s[0];
                }
            } else {
                const ext = path.extname(file).toLowerCase();
                if (ext == '.mp4' || ext == '.webm') {
                    file_type = 'video';
                } else if (ext == '.vtt') {
                    file_type = 'subtitle';
                } else if (ext == '.mp3' || ext == '.m4a') {
                    file_type = 'audio';
                } else {
                    logger.warn(`Error while scanning collection ${collection_id}: Unsupported file extension "${ext}" for file "${file}".`);
                    return;
                }
                name = path.basename(file).toLowerCase();
                for (var lang of utils.allLanguagesList()) { // TODO: Add support for language-region formats
                    lang = lang.toLowerCase();
                    if (name.includes(' ' + lang + ' ') || name.includes('-' + lang + '-') || name.includes('_' + lang + '_') || name.includes('.' + lang + '.')) {
                        name = name.replace(' ' + lang + ' ', ' ').replace('-' + lang + '-', '-').replace('_' + lang + '_', '_').replace('.' + lang + '.', '.');
                        language = utils.convertToTwoLetterCode(lang);
                        break;
                    }
                }
                name = name.replace(ext, '');
            }
            if (is_show) {
                const match = name.match(/E\d/i);
                if (match) {
                    name = name.replace(match[0], '');
                    episode = Number(match[0].replace(/E/i, ''));
                }
                const match2 = name.match(/S\d/i);
                if (match2) {
                    name = name.replace(match2[0], '');
                    season = Number(match2[0].replace(/E/i, ''));
                } else {
                    season = 1;
                }
                type = 'episode';
            }
            if (language) language = language.toLowerCase();
            name = name.trim();
            const q = await imdb.search(name);
            if (q.length == 0 || !q[0].id.startsWith('tt')) {
                logger.warn(`Error while scanning collection ${collection_id}: No results found for file "${file}"!`);
                return;
            }
            const imdb_id = q[0].id;
            logger.debug('Identified', file, 'as', q[0].id, q[0].title, `(${q[0].year})`);
            await imdb.get(imdb_id); // add imdb info to the database for good measure
            const d = [file, imdb_id, stream_title, type, file_type, language, stats.size, stats.mtime, collection_id, episode, season];
            if (!media_info) await global.database.exec(`INSERT INTO media VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, d);
            else {
                await global.database.exec(`UPDATE media SET path = ?, imdb_id = ?, stream_title = ?, type = ?, file_type = ?, stream_language = ?, size = ?, mtime = ?, collection_id = ?, episode = ?, season = ? WHERE id = '${media_info.id}'`, d);
            }
            if (info.allow_media_probe && global.config.ffprobe.enabled) {
                await new Promise((resolve, reject) => {
                    // TODO: make ffprobe use the http server instead of the file system
                    cp.exec(`${global.config.ffprobe.path} -v error -print_format json -show_format -show_streams -show_chapters "${file.replace('file://', '').replace(/\"/g, '\\"')}"`, async (err, stdout, stderr) => {
                        if (!err) {
                            const data = JSON.stringify(JSON.parse(stdout));
                            await global.database.exec(`INSERT INTO media_probes VALUES (NULL, ?, ?, ?)`, [file, data, collection_id]);
                        } else {
                            logger.error(`Error while probing "${file}": ${err.message}`);
                        }
                        resolve();
                    });
                });
            }
        }
    }
    for (const filename of await global.fileSystemBackends[protocol].readDir(info.path)) {
        const stats = await global.fileSystemBackends[protocol].stat(info.path + '/' + filename);
        if (!stats.isDirectory) {
            await scan(info.path + '/' + filename, stats);
        } else {
            for (const filename2 of await global.fileSystemBackends[protocol].readDir(info.path + '/' + filename)) {
                const stats2 = await global.fileSystemBackends[protocol].stat(info.path + '/' + filename + '/' + filename2);
                if (!stats2.isDirectory) {
                    await scan(info.path + '/' + filename + '/' + filename2, stats2, true);
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
    global.database.exec(`INSERT INTO collection VALUES (1, 'file://H:\\test-media', 'test', true, true, true)`).then(() => {
        scanCollection(1, true);
    });
})