'use strict';

const program = require('commander');
const version = require('../package').version;
const Seomon = require('./seomon');

exports.run = (argv) => {

    program
        .version(version)
        .option('-c, --config <file>', 'path to configuration file', '.config.yml')
        .option('-b, --browser <id>', 'run parsing in specified browser', 'chrome')
        .option('-r, --retry <num>', 'how many times a query should be rerun', 0)
        .option('-s, --set <id>', 'open search in specified set', collect)
        .option('-q, --query-list <file>', 'query list file')
        .option('-o, --output <file>', 'save result to csv file', 'out.csv')
        .parse(argv);

    const seomon = Seomon.create({
        configFile: program.config,
        browserName: program.browser,
        queryListFile: program.queryList,
        toFile: program.output,
        retry: program.retry,
        sets: program.set || []
    });

    seomon.run();
};

function collect(newValue, array = []) {
    return array.concat(newValue);
}
