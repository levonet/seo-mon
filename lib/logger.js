'use strict';

module.exports = {
    error: (err, msg) => {
        if (typeof err !== 'object' ) {
            console.error('ERROR', msg);
            console.error(err);
            return;
        }

        if (err.hasOwnProperty('JSON')) {
            return;
        }

        let json = JSON.stringify(err);
        err.JSON = json;

        console.error('ERROR', msg);

        if (err.hasOwnProperty('type')) {
            console.error(err.type, err.message);
        } else {
            console.error(err);
        }

        if (err.hasOwnProperty('seleniumStack')) {
            console.error(err.seleniumStack.type, err.seleniumStack.message);
        }
    }
};
