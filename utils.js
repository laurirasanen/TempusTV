function msToTimeStamp(duration)
{
    var milliseconds = parseInt(duration % 1000),
        seconds = parseInt((duration / 1000) % 60),
        minutes = parseInt((duration / (1000 * 60)) % 60),
        hours = parseInt((duration / (1000 * 60 * 60)) % 24);

    var hourstr = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;
    milliseconds = (milliseconds < 100) ? "0" + milliseconds : milliseconds;

    if (hours > 0)
        return `${hourstr}:${minutes}:${seconds}.${milliseconds}`;
    return `${minutes}:${seconds}.${milliseconds}`;
}

module.exports.msToTimeStamp = msToTimeStamp;