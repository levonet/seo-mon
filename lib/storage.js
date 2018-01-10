'use strict';

const fs = require('fs');
const os = require('os');
const json2csv = require('json2csv');
const log = require('./logger');

module.exports = {
    save(toFile, data, fields) {
        let hasTitle = false;

        fs.stat(toFile, (err, stat) => {
            if (err !== null) {
                if (err.code === 'ENOENT') {
                    hasTitle = true;
                } else {
                    log.error(err, `in fs.stat() file '${toFile}'`);
                    process.exit(101);
                }
            }

            json2csv({
                data: data,
                fields: fields,
                hasCSVColumnTitle: hasTitle
            }, (err, csv) => {
                if (err) {
                    log.error(err, 'in json2csv()');
                    process.exit(102);
                }

                fs.open(toFile, 'a', (err, fd) => {
                    if (err) {
                        log.error(err, `in fs.open() file '${toFile}'`);
                        process.exit(101);
                    }

                    fs.appendFile(fd, csv + os.EOL, 'utf8', (err) => {
                        if (err) {
                            log.error(err, `in fs.appendFile() descriptor ${fd}`);
                            process.exit(101);
                        }

                        fs.close(fd, (err) => {
                            if (err) {
                                log.error(err, `in fs.close() descriptor ${fd}`);
                                process.exit(101);
                            }
                        });
                    });
                });
            });
        });
    }
};
