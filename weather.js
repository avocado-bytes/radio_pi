const axios = require('axios');
const log = require('node-logger').createLogger('weather.log');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('weather.db');
const execSync = require('child_process').execSync;

const cliArgs = processCliArgs();
const link = `https://api.openweathermap.org/data/2.5/weather?q=${cliArgs.city}&appid=${cliArgs.apikey}&units=metric`;

db.run('CREATE TABLE IF NOT EXISTS weather (id integer not null primary key, date text, curr_temp integer, max integer, min integer, comment text);', () => {
    announce();
});

function announce() {
    db.all('SELECT * from weather ORDER BY ID DESC LIMIT 1', (err, row) => {
        if (err !== null) {
            log.error('Error retrieving data from the database');
        } else if (row.length === 0) {
            log.info('Database is empty');
            downloadWeatherData().then(() => announce());
        } else {
            const entry = row[0];
            const time = new Date();
            const entryDate = new Date(entry.date);
            const timeDifference = Math.abs(entryDate - time) / 60000;
            log.info('Minutes elapsed since last refresh: ' + Math.floor(timeDifference));
            if (timeDifference > 25) {
                downloadWeatherData().then(() => announce());
                return;
            }

            const text =
                `Weather information broadcast.
                    Current temperature is: ${entry.curr_temp} degrees Celsius.
                    Maximum temperature is: ${entry.max} degrees Celsius.
                    Minimum temperature is: ${entry.min} degrees Celsius.
                    Current weather description is: ${entry.comment}.
                    This information was gathered at ${entryDate.getHours()} hours and ${entryDate.getMinutes()} minutes CET.
                    `;
            execSync(`echo "${text}" | festival --tts`);
        }
    });
}

function downloadWeatherData() {
    return new Promise((resolve, reject) => {
        log.info('Weather information refresh requested');
        axios.get(link).then(response => {
            log.info('Weather information refreshed');

            const comment = response.data.weather[0].description;
            const date = getDateFromResponse(response.data.dt);
            const temp = response.data.main.temp;
            const max = response.data.main.temp_max;
            const min = response.data.main.temp_min;

            const preparedStatement =
                db.prepare('INSERT INTO weather (date, curr_temp, max, min, comment) VALUES (?, ?, ?, ?, ?)');

            preparedStatement.run(date, temp, max, min, comment, () => {
                log.info('Data persisted');
                resolve();
            });

        }, rej => {
            log.error('Weather data refresh failed');
            log.error(rej);
            reject(rej);
        });
    });
}

function getDateFromResponse(timeInMicros) {
    const timeMillis = parseInt(timeInMicros) * 1000;
    return new Date(timeMillis).toISOString();
}

function processCliArgs() {
    const args = {};
    process.argv.filter((value, index) => index > 1)
        .map(it => it.split('='))
        .forEach(it => args[it[0]] = it[1]);

    if (!args.hasOwnProperty('apikey') || args.apikey === undefined ||
        !args.hasOwnProperty('city') || args.city === undefined) {
        const errmsg = 'Vital parameters are missing. Provide "apikey" and "city" as cli args (e.g. node script.js apikey=somekey)';
        log.error(errmsg);
        throw new Error(errmsg)
    }

    return args;
}
