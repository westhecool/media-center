const yargs = require('yargs');
global.args = yargs
.option('log-level', { type: 'number', default: 1, description: 'Log level. 0 = debug, 1 = info, 2 = warn, 3 = error' })
.parse();
const Logger = require('./logger.js');
const path = require('path');
const logger = new Logger(path.basename(__filename));
logger.info('Starting up...');
const fs = require('fs');
fs.mkdirSync(process.cwd() + '/data', { recursive: true });
logger.debug('Args:', global.args);
logger.debug('Loading config...');
global.config = require('./config.js');
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
global.databese = require('./database.js');
require('./collection-scanner.js');
logger.debug('Starting server...');
const server = http.createServer(async (req, res) => {
    logger.debug('Request', req.url);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(JSON.stringify(await databese.fetch('SELECT * FROM media LIMIT 10;')));
});
server.listen(config.http.port, config.http.host, () => {
    logger.info(`Listening on http://${config.http.host}:${config.http.port}`);
});