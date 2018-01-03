'use strict';

const fs = require('fs');
const os = require('os');
const Promise = require('bluebird');
const readConfig = require('read-config');
const log = require('./logger');

module.exports = {
    openConfig: (fileName) => {
        try {
            return readConfig(fileName);
        } catch (err) {
            log.error(err, `in readConfig() file '${fileName}'`);
            process.exit(102);
        }
    },

    openQueryList: (fileName) => {
        try {
            return fs.readFileSync(fileName, 'utf-8').split(os.EOL);
        } catch (err) {
            log.error(err, `in fs.readFileSync() file '${fileName}'`);
            process.exit(101);
        }
    },

    shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};
