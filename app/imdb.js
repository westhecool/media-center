const imdb = require('imdb-client');

async function get(id) {
    var res = (await global.database.fetch(`SELECT * FROM imdb WHERE imdb_id = ?;`, [id]))[0];
    if (!res) {
        const data = await imdb.getAllParsed(id);
        var keywords = '';
        var genres = '';
        var cast = '';
        for (const keyword of data.meta.keywords) {
            keywords += keyword + ',';
        }
        for (const genre of data.meta.genres) {
            genres += genre + ',';
        }
        for (const cast_member of data.meta.cast) {
            cast += cast_member.name + ',';
        }
        cast = cast.substring(0, cast.length - 1);
        genres = genres.substring(0, genres.length - 1);
        keywords = keywords.substring(0, keywords.length - 1);
        await global.database.exec(`INSERT INTO imdb (imdb_id, title, original_title, certificate_rating, year, type, rating, keywords, genres, cast, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [
            id,
            data.meta.title,
            data.meta.originalTitle,
            data.meta.certificateRating,
            data.meta.releaseYear,
            data.meta.titleType,
            data.meta.rating,
            keywords,
            genres,
            cast,
            JSON.stringify(data)
        ]);
        res = (await global.database.fetch(`SELECT * FROM imdb WHERE imdb_id = ?;`, [id]))[0];
    }
    return res;
}

module.exports = {
    search: imdb.search,
    get
}