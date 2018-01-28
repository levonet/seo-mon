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
        this._configFile = params.configFile;
        this._browserName = params.browserName;
        this._queryListFile = params.queryListFile;
        this._toFile = params.toFile;
        this._sets = params.sets;
        this._retry = params.retry;

        this._config = utl.openConfig(this._configFile);

        if (!params.retry && this._config.retry) {
            this._retry = this._config.retry;
        }
    }

    run() {
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

        this._serialAsyncMap(utl.shuffle(querys), this.parseSerpWithRetry);
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

    /**
     * Обертка, которая позволяет перезапустить при ошибке заданное число раз
     * `parseSerp(query)`.
     * @param query
     * @param {number} _retry - Оставшееся число перезапусков. Не устанавливается для первого вызова
     * @returns {Promise}
     */
    parseSerpWithRetry(query, _retry) {
        if (_retry === undefined) {
            _retry = this._retry;
        } else {
            log.info(`Query '${query.text}' will be retried. Retries left: ${_retry}`);
        }

        return this.parseSerp(query)
            .catch((err) => {
                if (!_retry) {
                    return Promise.reject(err);
                }

                --count;
                return this.parseSerpWithRetry(query, _retry - 1)
            })
    }

    /**
     * Открывает в новом браузере запрос, ищет в поисковой выдаче совпадения с хостами,
     * при совпадении позицию и ссылки сохраняет в файл в формате CSV.
     * @param query - Объект, содержит {text, engine, engineSet}
     * @returns {Promise}
     */
    parseSerp(query) {
        const parser = {
            browser: null,
            query: query,
            engineSet: this._config.engines[query.engine].sets[query.engineSet],
            pages: this._config.engines[query.engine].pages || 1,
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

        if (query.text.match(/^\s*$/) !== null) {
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

        console.log(`${++count} '${url.toString()}&q=${query.text}' [${this._browserName}]`);

        /**
         * @todo Если реиспользовоть `browser`, то после `browser.end()` возникает ошибка:
         * Unhandled rejection Error: Cannot init a new session, please end your current session first
         * @see {@link http://webdriver.io/api/utility/reload.html}
         */
        parser.browser = webdriverio
            .remote(this._config.browsers[this._browserName]);

        return parser.browser
            .init()
            .catch((err) => {
                log.error(err, `in init() [${this._browserName}]`);
                return Promise.reject(err);
            })
            .url(url.toString())
            .catch((err) => {
                log.error(err, `open url ${url.toString()} [${this._browserName}]`);
                return Promise.reject(err);
            })
            .pause(this._waitBeforeAction(query.engine))
            .keys([query.text, 'Enter'])
            .catch((err) => {
                log.error(err, `in enter query '${query.text}' [${this._browserName}]`);
                return Promise.reject(err);
            })
            .getUrl()
            .then((currentUrl) => {
                if (URI(currentUrl).hostname() !== url.hostname()) {
                    return Promise.reject(
                        new Error(`Exception: instead ${url.toString()}\nwe have ${currentUrl}`));
                }

                /**
                 * Рекурсивно обходим страницы
                 */
                return this.parseSerpPage(parser)
                    .then((page) => {
                        log.info(`${count}:${page + 1} '${url.toString()}&q=${query.text}' [${this._browserName}]`);
                    }, (err) => {
                        log.error(err, 'DEBUG: Post parseSerpPage()');
                        return Promise.reject(err);
                    });
            }, (err) => {
                log.error(err, `in getUrl() [${this._browserName}]`);
                return Promise.reject(err);
            })
            .then(() => {
                if (!parser.data.length) {
                    return parser.browser
                        .end()
                        .then(() =>
                            Promise.reject(`NO DATA in query '${query.text}' [${this._browserName}]`));
                }

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
            }, (err) =>
                parser.browser
                    .end()
                    .then(() => Promise.reject(err))
            );
    }

    /**
     * Ищет совпадения с хостами (из monitoring) в поисковой выдаче на открытой странице.
     * Рекурсивно продолжает поиск на следующей странице, пока не достигнет ограничения,
     * установленного в конфиге, или конца выдачи.
     * Ссылки и позиция найденного сохраняется в `parser.data`.
     * @param parser         - Данные в рамках текущего запроса
     * @param {number} _page - Номер страницы. Если не указан, то `0`
     * @returns {Promise} Возврощает номер достигнутой страницы (от `0`).
     */
    parseSerpPage(parser, _page) {
        const page = _page === undefined ? 0 : _page;

        return parser.browser
            .pause(this._waitBeforeAction(parser.query.engine))
            .elements(this._config.engines[parser.query.engine].organicsSelector)
            .then((res) => {
                if (!res.value.length) {
                    return Promise.reject(new Error(`Can't find organic items on the page ${page +1}, query '${parser.query.text}' [${this._browserName}]`));
                }

                parser.setPosition(page, 'organic', res.value.length);

                let elems = [];
                res.value.forEach((elem) => {
                    elems.push(this.parseSerpItemWithRetry(parser, elem.ELEMENT));
                });
                return Promise
                    .all(elems)
                    .then((vals) => {
                        vals.forEach((elem, index) => {
                            if (elem === undefined) {
                                log.error(`Not receive data from element ${res.value[index].ELEMENT} on page ${page + 1}`);
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
                        return page;
                    });
            }, (err) => {
                log.error(err, `in elements() page ${page + 1}`);
                return Promise.reject(err);
            })
            .then(() => {
                if (page !== parser.pages - 1) {
                    return parser.browser
                        .element(this._config.engines[parser.query.engine].nextPageSelector)
                        .then((elem) => {
                            if (elem.value === null) {
                                log.info(`Next page ${page + 2} not found`);
                                return Promise.resolve(page);
                            }

                            return parser.browser
                                .elementIdClick(elem.value.ELEMENT)
                                .then(() => {
                                    return this.parseSerpPage(parser, page + 1)
                                });
                        });
                }

                return page;
            }, (err) => {
                return Promise.reject(err);
            });
    }

    /**
     * Обертка, которая позволяет перезапустить при ошибке заданное число раз
     * метод парсинга одной позиции в выдаче.
     * @param parser          - Данные в рамках текущего запроса
     * @param {string} elemId - id элемента
     * @param {number} _retry - Оставшееся число перезапусков. Не устанавливается для первого вызова
     * @returns {Promise} То, что возвращает `parseSerpItem()` или `undefined` в случае неудачи
     */
    parseSerpItemWithRetry(parser, elemId, _retry) {
        if (_retry === undefined) {
            _retry = this._retry;
        } else {
            log.info(`Item parsing '${elemId}' will be retried. Retries left: ${_retry}`);
        }

        return this.parseSerpItem(parser, elemId)
            .catch(() => {
                if (!_retry) {
                    return Promise.resolve(undefined);
                }

                return this.parseSerpItemWithRetry(parser, elemId, _retry - 1)
            })
    }

    /**
     * Парсинг одной позиции в выдаче Google
     * @param parser          - Данные в рамках текущего запроса
     * @param {string} elemId - id элемента
     * @returns {Promise} Возвращает объект содержащий {elemId, host, type, targetUrl, cacheUrl},
     * если позиция соответствует одному из искомых хостов, или только {elemId}, в случае несоответствия.
     */
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
                    return parser.browser
                        .elementIdElement(elemId, '.s .f>.action-menu>.action-menu-panel>ol>li>a')
                        .then((elem) => {
                            /**
                              * Не вся выдача имеет ссылки на кеш, ошибкой не считаем
                              */
                            if (elem.value === null) {
                                return Promise.resolve({value: ''})
                            }

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

    /**
     * Проверяет, находится ли хост среди искомых хостов (monitoring)
     * @param {string} host - Хост, который проверяем
     * @returns {boolean}
     * @todo Для ускорения нужно все из this._config.monitoring положить в hash, сделать проверку по ключу.
     */
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
