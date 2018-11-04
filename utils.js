var app = require('./app.js'),
    log = require('./log.js'),
    glob = require('glob'),
    fs = require('fs');

function msToTimeStamp(duration)
{
    var milliseconds = parseInt(duration % 1000),
        seconds = parseInt((duration / 1000) % 60),
        minutes = parseInt((duration / (1000 * 60)) % 60),
        hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    var hourstr = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    if (hours > 0)
        return `${hourstr}:${minutes}:${seconds}.${milliseconds}`;
    return `${minutes}:${seconds}.${milliseconds}`;
}

// Remove .vdm files
// These will mess with demo playback
function cleanUp()
{
    glob(tfPath + '*.vdm', (err, files) =>
    {
        for (var i = 0; i < files.length; i++)
        {
            fs.unlink(files[i], (err) =>
            {
                if (err)
                {
                    if (err.code === 'ENOENT')
                        return;
                    log.printLn('Failed to unlink .vdm files', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                }
            });
        }
    });
}

module.exports.msToTimeStamp = msToTimeStamp;
module.exports.cleanUp = cleanUp;