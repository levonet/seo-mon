'use strict';

const fs = require('fs');
const os = require('os');
const Promise = require('bluebird');
const webdriverio = require('webdriverio');
const URI = require('urijs');
const json2csv = require('json2csv');
const log = require('./logger');
const utl = require('./util');

module.exports = class Seomon {
    static create(params) {
        return new Seomon(params);
    }

    constructor(params) {
        this._config = {};
        this._configFile = params.configFile;
        this._browserName = params.browserName;
        this._queryListFile = params.queryListFile;
        this._toFile = params.toFile;
        this._sets = params.sets;
    }

    run() {
        let querySets = [];

        this._config = utl.openConfig(this._configFile);

        let queryList = utl.openQueryList(this._queryListFile);
        queryList.forEach((query) => {
            for (let engine in this._config.engines) {
                if (this._config.engines.hasOwnProperty(engine)
                    && this._config.engines[engine].hasOwnProperty('sets')) {
                    this._sets.forEach((set) => {
                        if (this._config.engines[engine].sets.hasOwnProperty(set)) {
                            querySets.push({
                                text: query,
                                engine: engine,
                                set: set
                            });
                        }
                    });
                }
            }
        });

        if (!querySets.length) {
            console.error('Something wrong: empty query list or empty configuration or sets not found in config.');
            console.error('\tItem in query list: ', queryList.length);
            console.error('\tSpecified sets: ', this._sets);
            console.log(this._availableSets());
            process.exit(100);
        }

        this._serialAsyncMap(utl.shuffle(querySets), this.seoParser);
    }

    _availableSets() {
        let result = 'Available sets:\n';
        let sets = [];

        for (let engine in this._config.engines) {
            if (this._config.engines.hasOwnProperty(engine)
                && this._config.engines[engine].hasOwnProperty('sets')) {

                for (let set in this._config.engines[engine].sets) {
                    if (this._config.engines[engine].sets.hasOwnProperty(set)) {
                        sets.push('\t' + set);
                    }
                }
            }
        }

        if (!sets.length) {
            return '\tNot found sets in config';
        }

        return result + sets.join('\n');
    }

    _serialAsyncMap(collection, fn) {
        let results = [];
        let promise = Promise.resolve();
      
        for (let item of collection) {
            promise = promise.then(() => fn.apply(this, [ item ]))
                .then((result) => results.push(result));
        }
      
        return promise.then(() => results);
    }

    seoParser(query) {
        let page = 0;
        let organicPosition = 0;
        let organicPagePosition = 0;
        let elems = [];
        let data = [];

        if (query.text.match(/^\S*$/) !== null) {
            return;
        }

        const url = new URI(this._config.engines[query.engine].sets[query.set].url);
        for (let param in utl.shuffle(this._config.engines[query.engine].sets[query.set].params)) {
            if (this._config.engines[query.engine].sets[query.set].params.hasOwnProperty(param)) {
                url.addQuery(param, this._config.engines[query.engine].sets[query.set].params[param]);
            }
        }

        // FIXIT: Если реиспользовоть `browser`, то после `browser.end()` возникает ошибка:
        // Unhandled rejection Error: Cannot init a new session, please end your current session first
        const browser = webdriverio
            .remote(this._config.browsers[this._browserName]);

        return browser
            .init()
            .url(url.toString())
            .click(this._config.engines[query.engine].inputSelector)
            .keys([query.text, 'Enter'])
            .getUrl()
            .then((currentUrl) => {
                let currentHost = URI(currentUrl).hostname();

                if (currentHost !== url.hostname()) {
                    return Promise.reject(new Error('Exception: instead ' + url.toString()
                        + '\nwe have ' + currentUrl));
                }
            })
            .then(() => {
                let pages = Array.from(new Array(this._config.engines[query.engine].pages), (val, index) => index + 1);

                return this._serialAsyncMap(pages, (page) => {
                    return browser
                        .elements(this._config.engines[query.engine].organicsSelector)
                        .then((res) =>{
                            res.value.forEach((elem) => {
                                elems.push(this.parseSerpItem(browser, data, query, elem.ELEMENT, page, ++organicPosition, ++organicPagePosition));
                            });
                            return Promise.all(elems);
                        })
                        .then(() => {
                            if (page !== this._config.engines[query.engine].pages) {
                                organicPagePosition = 0;
                                return browser.click(this._config.engines[query.engine].nextPageSelector)
                            }
                        })
                    });
            }, (err) => {
                return Promise.reject(err);
            })
            .then(() => {
                this.storeData(this._toFile, data);
                return browser.end();
            }, (err) => {
                browser.end();
                // FIXIT: Unhandled rejection
                return Promise.reject(err);
            });
    }

    // Google
    parseSerpItem(browser, data, query, elemId, page, organicPosition, organicPagePosition) {
        let targetUrl = '';

        return browser
            .elementIdElement(elemId, '.r a')
            .then((elem) => {
                return browser.elementIdAttribute(elem.value.ELEMENT, 'href');
            }, (err) => {
                log.seleniumError(err, 'find target link with id ' + elemId);
                return Promise.reject();
            })
            .then((val) => {
                let host = URI(val.value).hostname();

                if (this.isMonitoring(host)) {
                    targetUrl = decodeURI(val.value);
                    return browser.elementIdElement(elemId, '.s .f>.action-menu>.action-menu-panel>ol>li>a')
                        .then((elem) => {
                            return browser.elementIdAttribute(elem.value.ELEMENT, 'href');
                        }, (err) => {
                            log.seleniumError(err, 'find cache link with id ' + elemId);
                            return Promise.reject();
                        })
                        .then((val) => {
                            data.push({
                                date: new Date().toISOString().slice(0, 10),
                                query: query,
                                host: host,
                                type: 'organic',
                                page: page,
                                absolutePosition: 0,
                                absolutePagePosition: 0,
                                organicPosition: organicPosition,
                                organicPagePosition: organicPagePosition,
                                targetUrl: targetUrl,
                                cacheUrl: decodeURI(val.value)
                            });
                        });
                }
            }, (err) => {
                log.seleniumError(err, 'get href target link with id ' + elemId);
                return Promise.reject();
            });
    }

    // TODO: через hash
    isMonitoring(host) {
        let result = false;

        this._config.monitoring.forEach((val) => {
            if (host === val) {
                result = true;
            }
        });

        return result;
    }

    storeData(toFile, data) {
        const fields     = ['date', 'query.engine', 'query.set', 'query.text', 'host', 'type', 'page', 'absolutePosition', 'absolutePagePosition', 'organicPosition', 'organicPagePosition', 'targetUrl', 'cacheUrl'];
        const fieldNames = ['date', 'engine',       'set',       'query',      'host', 'type', 'page', 'absolutePosition', 'absolutePagePosition', 'organicPosition', 'organicPagePosition', 'targetUrl', 'cacheUrl'];
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
                fieldNames: fieldNames,
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
