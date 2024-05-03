class logger {
    constructor(filename = 'UNNKNOWNSOURCE') {
        this.filename = filename;
    }
    debug(...messages) {
        if (global.config.log_level <= 0) console.debug(`[${this.filename}][DEBUG]:`, ...messages);
    }
    info(...messages) {
        if (global.config.log_level <= 1) console.info(`[${this.filename}][INFO]:`, ...messages);
    }
    warn(...messages) {
        if (global.config.log_level <= 2) console.warn(`[${this.filename}][WARN]:`, ...messages);
    }
    error(...messages) {
        if (global.config.log_level <= 3) console.error(`[${this.filename}][ERROR]:`, ...messages);
    }
}
module.exports = logger;