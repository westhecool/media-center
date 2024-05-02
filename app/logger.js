class logger {
    constructor(filename = 'UNNKNOWNSOURCE') {
        this.filename = filename;
    }
    debug(...messages) {
        if (global.args.logLevel <= 0) console.debug(`[${this.filename}][DEBUG]:`, ...messages);
    }
    info(...messages) {
        if (global.args.logLevel <= 1) console.info(`[${this.filename}][INFO]:`, ...messages);
    }
    warn(...messages) {
        if (global.args.logLevel <= 2) console.warn(`[${this.filename}][WARN]:`, ...messages);
    }
    error(...messages) {
        if (global.args.logLevel <= 3) console.error(`[${this.filename}][ERROR]:`, ...messages);
    }
}
module.exports = logger;