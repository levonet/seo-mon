# Seo monitoring

`seo-mon` — инструмент для мониторинга позиций сайтов в поисковой выдаче.

## Dependencies

Для запуска с использованием локальных браузеров необходимо установить [Selenium Server](http://docs.seleniumhq.org/download/):

```sh
npm install -g selenium-standalone
selenium-standalone install
```

Selenium Server запускается в отдельном терминале командой:

```sh
selenium-standalone start
```

Так как в крайней версии Selenium имеется ошибка, из-за которой теряются ответы команд, рекомендуется использовать стабильную версию:

```sh
selenium-standalone install --version=3.4.0
selenium-standalone start --version=3.4.0
```

## Installing

```sh
git clone https://github.com/levonet/seo-mon.git
cd seo-mon
npm install
```

## Configuration

Пример конфигурационного файла:

```yml
browsers:
  chrome:
    desiredCapabilities:
      browserName: chrome

engines:
  google:
    inputSelector: input[name=q]
    organicsSelector: '#rso>._NId .g .rc'
    nextPageSelector: '#pnnext'
    pages: 3
    sets:
      uk-UA-Kyiv:
        url: https://www.google.com.ua/
        params:
          cr: countryUA
          hl: uk
          lr: lang_uk
          near: Kyiv
          num: 10

monitoring:
  - busfor.ua
  - busfor.ru
  - bus.com.ua
```

Конфигурационный файл состоит из трех секций:

  - `browsers` — настройки браузеров 
  - `engines` — настройка поисковых запросов и селекторы для поиска результатов в выдаче
  - `monitoring` — список доменов, которые отслеживаются в выдаче

### browsers

`browsers` содержит настройки браузеров, подробнее в разделе [Configuration](http://webdriver.io/guide/getstarted/configuration.html) webdriver.io.

### engines

`engines` содержит настройка поисковых запросов и селекторы для поиска результатов в выдаче.

На данный момент поддерживается:

  - `google`

В `sets` описываются URL и параметры поискового сайта. Подробнее про параметры в документации [Google Custom Search](https://developers.google.com/custom-search/docs/xml_results).

## Using CLI

Пример запуска:

```sh
bin/seomon -q ./query-list-ua.txt -s uk-UA-Kyiv -o uk-UA-Kyiv.csv
```

Для запуска с одним списком выдачи можно указать несколько `sets`.
Результаты работы сохраняются в формате csv.

Подробнее про параметры запуска смотри в `bin/seomon --help`.
