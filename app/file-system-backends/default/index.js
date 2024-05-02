const fs = require('fs');

module.exports = {
    supportedProtocols: ['file'],
    stat: async (path) => {
        const stat = await fs.promises.stat(path.replace('file://', ''));
        return {
            size: stat.size,
            mtime: new Date(stat.mtime).getTime() / 1000,
            isDirectory: stat.isDirectory()
        };
    },
    readStream: async (path, start = 0, end = undefined) => fs.createReadStream(path.replace('file://', ''), { start, end }),
    readDir: async (path) => { return await fs.promises.readdir(path.replace('file://', '')) },
    exists: (path) => new Promise((resolve, reject) => {
        fs.promises.stat(path.replace('file://', '')).then(() => resolve(true)).catch(() => resolve(false));
    })
}