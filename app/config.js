// Please do not edit this file. Use config.jsonc instead.
const jsonc = require('jsonc');
const utils = require('./utils.js');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger.js');
const logger = new Logger(path.basename(__filename));
const defaults = {
    videojs: {
        js_path: path.dirname(require.resolve('video.js')) + '/video.js',
        css_path: path.dirname(require.resolve('video.js')) + '/video-js.css'
    },
    http: {
        port: 8080,
        host: '0.0.0.0'
    },
    ffmpeg: {
        enabled: true,
        path: 'ffmpeg',
        hwaccel: 'none',
        codec: 'h264',
        custom_args: ''
    },
    ffprobe: {
        enabled: true,
        path: 'ffprobe'
    },
    log_level: 1
};
if (!fs.existsSync(process.cwd() + '/config/config.jsonc')) {
    fs.writeFileSync(process.cwd() + '/config/config.jsonc', '// see config.example.jsonc for an example config\n{}', 'utf8');
}
var config = jsonc.parse(fs.readFileSync(process.cwd() + '/config/config.jsonc', 'utf8'), defaults);
function merge(defaults, overrides, path = 'config') {
    for (const key in overrides) {
        if (overrides.hasOwnProperty(key)) {
            if (utils.typeOf(overrides[key]) !== utils.typeOf(defaults[key])) {
                logger.warn(`Configuration option for "${`${path}.${key}`}" is of type "${utils.typeOf(overrides[key])}" which is different from the expected type "${utils.typeOf(defaults[key])}".`);
            }
            if (utils.typeOf(overrides[key]) === 'object') {
                defaults[key] = merge(defaults[key], overrides[key], `${path}.${key}`);
            } else {
                defaults[key] = overrides[key];
            }
        }
    }
    return defaults;
}
module.exports = merge(defaults, config);