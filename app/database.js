const sqlite3 = require('sqlite3');
const Logger = require('./logger.js');
const path = require('path');
const logger = new Logger(path.basename(__filename));
logger.debug('Opening database...');
const database = new sqlite3.Database(process.cwd() + '/data/database.db');
async function fetch(sql) {
    return new Promise((resolve, reject) => {
        database.all(sql, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}
async function exec(sql, params = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, params, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}
logger.debug('Creating tables...');
database.exec("CREATE TABLE IF NOT EXISTS imdb (id INTEGER PRIMARY KEY AUTOINCREMENT, imdb_id TEXT, title TEXT, original_title TEXT, certificate_rating TEXT, year INTEGER, type TEXT, rating FLOAT, keywords TEXT, genres TEXT, cast TEXT, json TEXT);");
database.exec("CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, imdb_id TEXT, stream_title TEXT, type TEXT, file_type TEXT, stream_language TEXT, size INTEGER, mtime DATE, collection_id INTEGER, episode INTEGER, season INTEGER);");
database.exec("CREATE TABLE IF NOT EXISTS media_probes (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, data TEXT, collection_id INTEGER);"); // TODO: add quality, codec, 10-bit color to search by
database.exec("CREATE TABLE IF NOT EXISTS collection (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, name TEXT, allow_transcoding BOOLEAN, allow_media_probe BOOLEAN, use_custom_naming_format BOOLEAN);");
module.exports = {
    exec,
    fetch
}