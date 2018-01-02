'use strict';

const program = require('commander');
const version = require('../package').version;

const log = require('./logger');
const Seomon = require('./seomon');


exports.run = (argv) => {

    program
        .version(version)
        .option('-c, --config <file>', 'path to configuration file', '.config.yml')
        .option('-b, --browser <id>', 'run parsing in specified browser', 'chrome')
        .option('-q, --query-list <file>', 'query list file')
        .option('-s, --set <id>', 'open search in specified set', collect)
        .option('-o, --output <file>', 'save result to csv file')
        .parse(argv);

    const seomon = Seomon.create({
        configFile: program.config,
        browserName: program.browser,
        queryListFile: program.queryList,
        toFile: program.output,
        sets: program.set || []
    });

    seomon.run();
};

function collect(newValue, array = []) {
    return array.concat(newValue);
}
