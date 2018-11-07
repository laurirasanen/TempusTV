var fs = require('fs'),
    logSeverity = 0;
    
var timeStamp =
    {
        get now()
        {
            var date = new Date();
            var month = (date.getUTCMonth() + 1).toString().length === 1 ? '0' + (date.getUTCMonth() + 1) : (date.getUTCMonth() + 1);
            var day = date.getUTCDate().toString().length === 1 ? '0' + date.getUTCDate() : date.getUTCDate();
            var hour = date.getUTCHours().toString().length === 1 ? '0' + date.getUTCHours() : date.getUTCHours();
            var minute = date.getUTCMinutes().toString().length === 1 ? '0' + date.getUTCMinutes() : date.getUTCMinutes();
            var second = date.getUTCSeconds().toString().length === 1 ? '0' + date.getUTCSeconds() : date.getUTCSeconds();
            return `[${date.getUTCFullYear()}-${month}-${day} ${hour}-${minute}-${second}]`;
        }
    };
var logPath = `${__dirname}/logs/log_${timeStamp.now.replace(' ', '_').replace('[', '').replace(']', '')}.txt`;

fs.mkdir(`${__dirname}/logs`, err =>
{
    if (err)
    {
        if (err.code == 'EEXIST')
            return;
        else
            throw (`Could not create logs directory in ${__dirname}`);
    }
});
const logFile = fs.createWriteStream(logPath);
const errFile = fs.createWriteStream(logPath.replace('log_', 'err_'));

const severity = {
    'DEBUG': 0,
    'INFO': 1,
    'WARN': 2,
    'ERROR': 3,
    'FATAL': 4
};

function printLn(msg, severity)
{
    var color = '';
    var stamp = '';
    var reset = '\x1b[0m';
    switch (severity)
    {
        case 0:
            color = '\x1b[32m'; //green
            break;
        case 1: 
            color = '';
            stamp = '[INFO]';
            break;
        case 2: 
            color = '\x1b[33m'; //yellow
            stamp = '[WARN]';
            break;
        case 3:
            color = '\x1b[31m' //red
            stamp = '[ERROR]'
            break;
        case 4:
            color = '\x1b[41m' //bg red
            stamp = '[FATAL]'
            break;
        default:
            color = ''
            stamp = '[INFO]'
            break;
    }
    logFile.write(`${timeStamp.now}${stamp} ${msg}\n`);

    // Don't print to console if lower than log severity in config
    if (severity >= logSeverity)
    {
        msg = `${timeStamp.now} ${color}${msg}${reset}`;
        console.log(msg);
    }
}
function printLnNoStamp(msg, severity)
{
    var color = '';
    var reset = '\x1b[0m';
    switch (severity)
    {
        case 0:
            color = '\x1b[32m'; //green
            break;
        case 1:
            color = '';
            break;
        case 2:
            color = '\x1b[33m'; //yellow
            break;
        case 3:
            color = '\x1b[31m' //red
            break;
        case 4:
            color = '\x1b[41m' //bg red
            break;
        default:
            color = ''
            break;
    }
    logFile.write(`${msg}\n`);

    // Don't print to console if lower than log severity in config
    if (severity >= logSeverity)
    {
        msg = `${color}${msg}${reset}`;
        console.log(msg);
    }
}
function error(err)
{
    if(err.message && err.stack)
        errFile.write(`${timeStamp.now} ${err.message}\n${err.stack}\n`);
}

module.exports.printLn = printLn;
module.exports.printLnNoStamp = printLnNoStamp;
module.exports.severity = severity;
module.exports.logSeverity = logSeverity;
module.exports.error = error;