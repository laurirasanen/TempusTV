var https = require('https'),
    http = require('http'),
    fs = require('fs'),
    unzip = require('unzip'),
    bz2 = require('unbzip2-stream'),
    app = require('./app.js'),
    log = require('./log.js'),
    overlay = require('./overlay.js'),
    models = require('../DemoTools/fix_models.js');

// Download demo file from AWS
function getDemoFile(index, cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    var dest = tfPath + demos[index].demo_info.filename + '.dem'; 

    fs.open(dest, 'wx', (err, fd) =>
    {
        if (fd)
        {
            fs.close(fd, (err) => {
                if (err)
                {
                    log.printLn('[DL] Failed to close demoFile handle', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                }
            });
        }

        if (err)
        {
            if (err.code === 'EEXIST' || err.code === 'EPERM')
            {
                // already exists
                return cb(false);
            }
            else
            {
                log.printLn(`[DL] Error opening file ${dest}!`, log.severity.ERROR);
                log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                return cb(null);
            }
        }
        else
        {
            overlay.drawLoadingStatus('Downloading demo from tempus');

            var stream = fs.createWriteStream(dest);

            download(demos[index].demo_info.url, false, (resp) =>
            {
                resp.pipe(unzip.Parse())
                    .on('entry', (entry) =>
                    {
                        entry.pipe(stream);
                        stream.on('finish', () =>
                        {
                            stream.close(() =>
                            {
                                log.printLn(`[DL] Downloaded demo ${demos[index].demo_info.filename}`, log.severity.DEBUG);
                                // jungle inferno date 2017-10-16
                                // boshy and kaptain are pretty much only people with original wrs before jungle inferno
                                // un gato has cheval wr with mangler
                                if (demos[index].demo_info.date < 1508112000 && demos[index].record_info.class == 3 &&
                                    ((demos[index].player_info.steamid == 'STEAM_0:0:43167835' || demos[index].player_info.steamid == 'STEAM_0:0:36730682') ||
                                    demos[index].player_info.steamid == 'STEAM_0:1:53042796' && (demos[index].map_info.name == 'jump_cheval' || demos[index].map_info.name == 'jump_arctic_a2' )))
                                {
                                    overlay.drawLoadingStatus('Fixing viewmodels');

                                    // return true regardless of the fix being succesful
                                    // playing the demo is more important than having working viewmodels
                                    models.fixModels(dest, dest/*.split('.dem')[0] + '_fixed.dem'*/, (err) =>
                                    {
                                        if (err)
                                        {
                                            log.printLn(`[DEMOTOOLS] Error fixing viewmodels in ${demos[index].demo_info.filename}`, log.severity.DEBUG);
                                            log.printLnNoStamp(JSON.stringify(err), log.severity.ERROR);
                                            return cb(true);
                                        }

                                        log.printLn(`[DEMOTOOLS] Fixed viewmodels in ${demos[index].demo_info.filename}`, log.severity.DEBUG);
                                        return cb(true);
                                    });
                                }
                                else
                                    return cb(true);
                            });

                        }).on('error', () =>
                        {
                            stream.close(() => { });
                            log.printLn('[DL] Piping to file failed!', log.severity.ERROR);
                            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                            return cb(null);
                        });

                    }).on('error', (err) =>
                    {
                        stream.close(() => { });
                        log.printLn(`[DL] unzip failed!`, log.severity.ERROR);
                        log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                        return cb(null);
                    });
            });
        }
    });
}

// Download map file from http://tempus.site.nfoservers.com/server/maps/
function getMap(mapName, cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    var dest = tfPath + `download/maps/${mapName}.bsp`;

    fs.open(dest, 'wx', (err, fd) =>
    {
        if (fd)
        {
            fs.close(fd, (err) => {
                if (err)
                {
                    log.printLn('[DL] Failed to close map handle', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                }
            });
        }

        if (err)
        {
            if (err.code === 'EEXIST' || err.code === 'EPERM')
            {
                // already exists
                return cb(false);
            }
            else
            {
                log.printLn(`[DL] Error opening map ${dest}!`, log.severity.ERROR);
                log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                return cb(null);
            }
        }
        else
        {
            overlay.drawLoadingStatus('Downloading map from tempus');

            var stream = fs.createWriteStream(tfPath + `/download/maps/${mapName}.bsp`);

            var mapUrl = `http://tempus.site.nfoservers.com/server/maps/${mapName}.bsp.bz2`;

            download(mapUrl, true, (resp) =>
            {                
                resp.pipe(bz2()
                    .on('error', (err) =>
                    {
                        stream.close(() => { });
                        log.printLn('[TEMPUS] bz2 failed', log.severity.ERROR);
                        log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                        return;
                    })
                ).pipe(stream)
                stream.on('finish', () =>
                {
                    stream.close(() =>
                    {
                        log.printLn(`[DL] Downloaded map ${mapName}`, log.severity.DEBUG);
                        return cb(true);
                    });

                }).on('error', (err) =>
                {
                    stream.close(() => { });
                    log.printLn('[DL] Piping to file failed!', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                    return cb(null);
                });
            });
        }
    });
}

function download(url, map, callback)
{
    var request = http.get(url, function (response)
    {
        var len = parseInt(response.headers['content-length'], 10);
        var data;
        var cur = 0;
        var total = len / 1048576; //1048576 - bytes in 1 Megabyte
        var lastP = 0;

        response.on("data", function (chunk)
        {
            data += chunk;
            cur += chunk.length;
            // only update every %
            if ((100.0 * cur / len).toFixed(0) != lastP)
            {
                if (map)
                    overlay.drawLoadingStatus('Downloading map from tempus<br/>Progress: ' + (100.0 * cur / len).toFixed(0) + "% (" + (cur / 1048576).toFixed(2) + "/" + total.toFixed(0) + " MB)");
                else
                    overlay.drawLoadingStatus('Downloading demo from tempus<br/>Progress: ' + (100.0 * cur / len).toFixed(0) + "% (" + (cur / 1048576).toFixed(2) + "/" + total.toFixed(0) + " MB)");
                lastP = (100.0 * cur / len).toFixed(0);
            }
        });

        request.on("error", function (e)
        {
            log.printLn('[DL] Error downloading', log.severity.ERROR);
            log.printLnNoStamp(e.message);
        });

        callback(response);
    });
};

module.exports.getDemoFile = getDemoFile;
module.exports.getMap = getMap;