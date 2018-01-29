'use strict';

module.exports = {
    error: (err, msg) => {
        const time = new Date().toISOString().slice(11, -1);

        if (typeof err !== 'object') {
            if (msg !== undefined) {
                console.error(`${time} [ProgramError] ${msg}`);
                console.error(`${time} ${err}`);
            } else {
                console.error(`${time} [ProgramError] ${err}`);
            }
            return;
        }

        if (err.hasOwnProperty('JSON')) {
            return;
        }

        let json = JSON.stringify(err);
        err.JSON = json;

        console.error(`${time} [ProgramError] ${msg}`);

        if (err.hasOwnProperty('type')) {
            console.error(`${time} [${err.type}] ${err.message}`);
        } else {
            console.error(`${time} ${err}`);
        }

        if (err.hasOwnProperty('seleniumStack')) {
            console.error(`${time} [${err.seleniumStack.type}] ${err.seleniumStack.message}`);
        }
    },

    info: (msg) => {
        const time = new Date().toISOString().slice(11, -1);

        console.error(`${time} [Info] ${msg}`);
    }
};
