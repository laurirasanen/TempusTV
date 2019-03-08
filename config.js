var fs = require('fs'),
    log = require('./log.js'),
    app = require('./app.js');

const nicksConfig = './nicknames.json';
const mainConfig = './config.json';
const sampleConfig = './sample_config.json';

// Save a nickname to file
function saveNick(steamid, name, moderator = '', cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    loadNicks((err, nicks) =>
    {
        if (err)
        {
            nicks = [{ 'steamid': steamid, 'name': name }];
        }
        else
        {
            if (nicks && nicks.length > 0)
            {
                for (var i = 0; i < nicks.length; i++)
                {
                    if (nicks[i].steamid == steamid)
                    {
                        nicks[i].name = name;
                        log.printLn(`[CONFIG] Changing nickname: { steamid: ${steamid}, name: ${name} }`);
                        break;
                    }
                    else
                    {
                        if (i == nicks.length - 1)
                        {
                            nicks.push({ 'steamid': steamid, 'name': name });
                            log.printLn(`[CONFIG] Adding new nickname: { steamid: ${steamid}, name: ${name} }`);
                            break;
                        }
                    }
                }
            }
            else
            {
                nicks = [{ 'steamid': steamid, 'name': name }];
            }
        }

        for (var i = 0; i < demos.length; i++)
        {
            if (demos[i].player_info)
                for (var e = 0; e < nicks.length; e++)
                    if (demos[i].player_info.steamid == nicks[e].steamid && demos[i].player_info.name != nicks[e].name)
                        demos[i].player_info.name = nicks[e].name;
        }

        fs.writeFile(nicksConfig, JSON.stringify(nicks), (err) =>
        {
            if (err)
            {
                log.printLn('[CONFIG] Error writing nicks', log.severity.ERROR);
                log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                return cb(false, moderator);
            }
            else
            {
                log.printLn('[CONFIG] Nicknames saved', log.severity.DEBUG);
                return cb(true, moderator);
            }                
        });      
    });
}

// Load nicknames from file
function loadNicks(cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    fs.readFile(nicksConfig, (err, data) =>
    {
        if (err)
        {
            if (err.code == 'ENOENT')
                return cb(null, null);
            else
                return cb(err, null);
        }
        if (data)
        {
            var nicks = null;
            try
            {
                nicks = JSON.parse(data);
            }
            catch (jsonErr)
            {
                log.printLn('[CONFIG] Error parsing nicknames', log.severity.ERROR);
                log.printLnNoStamp(JSON.stringify(jsonErr), log.severity.DEBUG);
                return cb(jsonErr, null)
            }
            return cb(null, nicks);             
        }
    });
}


// TODO:
// We only need to load the cfg when the program starts and when we make changes to it with saveCfg().
// Don't call this from elsewhere, use a variable instead
function loadCfg(cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    fs.readFile(mainConfig, (err, data) =>
    {
        if (err)
        {
            if (err.code == 'ENOENT')
            {
                log.printLn(`[CONFIG] config.json doesn't exist, using sample config!`);
                fs.readFile(sampleConfig, (err, data) =>
                {
                    if (err)
                        return cb(err, null);
                    if (data)
                    {
                        var cfg = null;
                        try
                        {
                            cfg = JSON.parse(data);
                        }
                        catch (jsonErr)
                        {
                            log.printLn('[CONFIG] Error parsing config', log.severity.ERROR);
                            log.printLnNoStamp(JSON.stringify(jsonErr), log.severity.DEBUG);
                            return cb(jsonErr, null);
                        }
                        log.printLn('[CONFIG] sample_config.json loaded!');
                        return cb(null, cfg);
                    }
                });
            }
            else
                return cb(err, null);
        }
        if (data)
        {

            var cfg = null;
            try
            {
                cfg = JSON.parse(data);
            }
            catch (jsonErr)
            {
                log.printLn('[CONFIG] Error parsing config', log.severity.ERROR);
                log.printLnNoStamp(jsonErr, log.severity.DEBUG);
                return cb(jsonErr, null);
            }
            log.printLn('[CONFIG] config.json loaded!');
            return cb(null, cfg);
        }
    });
}

// TODO:
// Add config editing with twitch commands
// i.e. edit blacklisted runs with !blacklist, etc.
function saveCfg(cb)
{

}

// FIXME:
// Doesn't work
loadCfg((err, cfg) =>
{
    if (err) return;

    log.logSeverity = cfg.log.severity;
});

module.exports.loadNicks = loadNicks;
module.exports.saveNick = saveNick;
module.exports.loadCfg = loadCfg;