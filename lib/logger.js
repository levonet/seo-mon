'use strict';

module.exports = {
    error: (err, msg) => {
        console.error('ERROR', msg);
        console.error(err);
    },
    seleniumError: (err, msg) => {
        console.error('ERROR', msg);
        console.error(err.type, err.message);
        console.error(err.seleniumStack.type, err.seleniumStack.message);
    }
};
