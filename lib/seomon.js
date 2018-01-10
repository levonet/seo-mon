'use strict';

const Promise = require('bluebird');
const webdriverio = require('webdriverio');
const URI = require('urijs');
const log = require('./logger');
const utl = require('./util');
const storage = require('./storage');
// DEBUG
let count = 0;
let errors = 0;

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
        this._config = utl.openConfig(this._configFile);

        let querys = [];
        let queryList = utl.openQueryList(this._queryListFile);

        queryList.forEach((query) => {
            for (let engine in this._config.engines) {
                if (this._config.engines.hasOwnProperty(engine)
                    && this._config.engines[engine].hasOwnProperty('sets')) {
                    this._sets.forEach((set) => {
                        if (this._config.engines[engine].sets.hasOwnProperty(set)) {
                            querys.push({
                                text: query,
                                engine: engine,
                                engineSet: set
                            });
                        }
                    });
                }
            }
        });

        if (!querys.length) {
            console.error('Something wrong: empty query list or empty configuration or sets not found in config.');
            console.error('\tItem in query list: ', queryList.length);
            console.error('\tSpecified sets: ', this._sets);
            console.log(this._availableSets());
            process.exit(100);
        }

        this._serialAsyncMap(utl.shuffle(querys), this.parseSerp);
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
                .then(
                    (result) => results.push(result),
                    (err) => {
                        log.error(err, 'ASYNC ERR');
                        // DEBUG
                        console.log('>', ++errors, item);
                        return Promise.resolve();
                    }
                );
        }
      
        return promise.then(() => results);
    }

    _waitBeforeAction(engine) {
        let minWait = this._config.engines[engine].waitBeforeActionMin || 0;
        let maxWait = this._config.engines[engine].waitBeforeActionMax || 0;

        if (minWait < maxWait) {
            maxWait = maxWait - minWait;
        } else {
            if (!maxWait) {
                minWait = maxWait;
                maxWait = 0;
            }
        }

        return Math.floor(minWait + Math.random() * maxWait);
    }

    _safeDecodeURI(uri) {
        let result;

        try {
            result = decodeURI(uri)
        } catch (e) {
            result = uri
        }

        return result;
    }

    parseSerp(query) {
        const parser = {
            browser: null,
            query: query,
            engineSet: this._config.engines[query.engine].sets[query.engineSet],
            counters: {},
            data: [],
            setPosition: function(page, type, length) {
                if (!this.counters.hasOwnProperty(page)) {
                    this.counters[page] = {};
                }
                if (!this.counters[page].hasOwnProperty(type)) {
                    this.counters[page][type] = !page
                            ? length
                            : this.counters[page - 1][type] + length;
                }
            },
            getPosition: function(page, type, index) {
                return !page ? index + 1 : this.counters[page - 1][type] + index + 1;
            }
        };

        if (query.text.match(/^\S*$/) !== null) {
            return Promise.resolve();
        }

        const url = new URI(parser.engineSet.url);
        utl.shuffle(parser.engineSet.params).forEach((items) => {
            for (let param in items) {
                if (items.hasOwnProperty(param)) {
                    url.addQuery(param, items[param]);
                }
            }
        });
        // DEBUG
        console.log(++count, url.toString(), query.text);

        // FIXIT: Если реиспользовоть `browser`, то после `browser.end()` возникает ошибка:
        // Unhandled rejection Error: Cannot init a new session, please end your current session first
        parser.browser = webdriverio
            .remote(this._config.browsers[this._browserName]);

        return parser.browser
            .init()
            .catch((err) => {
                log.error(err, `in init() ${this._browserName}`);
                return Promise.reject(err);
            })
            .url(url.toString())
            .catch((err) => {
                log.error(err, `open url ${url.toString()} in ${this._browserName}`);
                return Promise.reject(err);
            })
            .pause(this._waitBeforeAction(query.engine))
            .keys([query.text, 'Enter'])
            .catch((err) => {
                log.error(err, `in enter query '${query.text}' in ${this._browserName}`);
                return Promise.reject(err);
            })
            .getUrl()
            .then((currentUrl) => {
                if (URI(currentUrl).hostname() !== url.hostname()) {
                    return Promise.reject(
                        new Error(`Exception: instead ${url.toString()}\nwe have ${currentUrl}`));
                }
            })
            .then(() => {
                let pages = Array.from(new Array(this._config.engines[query.engine].pages), (val, index) => index);

                return this._serialAsyncMap(pages, (page) => {
                        return this.parseSerpPage(parser, page);
                    });
            }, (err) => {
                // DEBUG
                console.log('>>>', err);
                return Promise.reject(err);
            })
            .then(() => {
               storage.save(this._toFile, parser.data, [
                    'date',
                    'engine',
                    'engineSet',
                    'queryText',
                    'host',
                    'type',
                    'page',
                    'absolutePosition',
                    'absolutePagePosition',
                    'organicPosition',
                    'organicPagePosition',
                    'targetUrl',
                    'cacheUrl'
                ]);
                return parser.browser.end();
            }, (err) => {
                parser.browser.end();
                return Promise.reject(err);
            });
    }

    parseSerpPage(parser, page) {
        return parser.browser
            .pause(this._waitBeforeAction(parser.query.engine))
            .elements(this._config.engines[parser.query.engine].organicsSelector)
            .then((res) => {
                parser.setPosition(page, 'organic', res.value.length);

                let elems = [];
                res.value.forEach((elem) => {
                    elems.push(this.parseSerpItem(parser, elem.ELEMENT));
                });
                return Promise
                    .all(elems.map(p => p.catch(() => undefined)))
                    .then((vals) => {
                        vals.forEach((elem, index) => {
                            if (elem === undefined) {
                                // DEBUG
                                console.log(`need retry(${res.value[index].ELEMENT}') on page ${page + 1}`);
                                return;
                            }

                            if (elem.hasOwnProperty('host')) {
                                parser.data.push({
                                    date: new Date().toISOString().slice(0, 10),
                                    engine: parser.query.engine,
                                    engineSet: parser.query.engineSet,
                                    queryText: parser.query.text,
                                    host: elem.host,
                                    type: elem.type,
                                    page: page + 1,
                                    absolutePosition: 0,
                                    absolutePagePosition: 0,
                                    organicPosition: parser.getPosition(page, 'organic', index),
                                    organicPagePosition: index + 1,
                                    targetUrl: elem.targetUrl,
                                    cacheUrl: elem.cacheUrl
                                });
                            }
                        });
                        return vals;
                    });
            }, (err) => {
                log.error(err, `in elements() page ${page}`);
                return Promise.reject(err);
            })
            .then(() => {
                if (page !== this._config.engines[parser.query.engine].pages) {
                    // FIXIT: Прежде чем кликнуть, нужно найти селектор
                    return parser.browser.click(this._config.engines[parser.query.engine].nextPageSelector)
                }
            }, (err) => {
                return Promise.reject(err);
            });
    }

    // Google
    parseSerpItem(parser, elemId) {
        return parser.browser
            .elementIdElement(elemId, '.r a')
            .then((elem) => {
                return parser.browser.elementIdAttribute(elem.value.ELEMENT, 'href');
            }, (err) => {
                log.error(err, `in elementIdElement() '${elemId}': Can't find target link`);
                return Promise.reject(err);
            })
            .then((val) => {
                let host = URI(val.value).hostname();

                if (this.isMonitoring(host)) {
                    let targetUrl = this._safeDecodeURI(val.value);
                    return parser.browser.elementIdElement(elemId, '.s .f>.action-menu>.action-menu-panel>ol>li>a')
                        .then((elem) => {
                            return parser.browser.elementIdAttribute(elem.value.ELEMENT, 'href');
                        }, (err) => {
                            log.error(err, `in elementIdElement() '${elemId}': Can't find cache link`);
                            return Promise.reject(err);
                        })
                        .then((val) => {
                            return {
                                elemId: elemId, // for debug
                                host: host,
                                type: 'organic',
                                targetUrl: targetUrl,
                                cacheUrl: val.value
                            };
                        }, (err) => {
                            log.error(err, `in elementIdAttribute() '${elemId}': Can't get cache href`);
                            return Promise.reject(err);
                        });
                }
                return {elemId: elemId};
            }, (err) => {
                log.error(err, `in elementIdAttribute() '${elemId}': Can't get target href`);
                return Promise.reject(err);
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
};
