var overlay = require('./overlay.js'),
    app = require('./app.js'),
    tempus = require('tempus-api'),
    downloader = require('./downloader.js');
    log = require('./log.js'),
    rcon = require('./rcon.js'),
    obs = require('./obs.js'),
    fs = require('fs'),
    uuid = require('uuid'),
    twitch = require('./twitch.js'),
    config = require('./config.js');

// Vice changed accounts at some point.
// All records in tempus api have his new steamid but the old demo files themselves don't.
// This breaks the spec_player "STEAMID" command.
var old_steamids = [
    { current: 'STEAM_0:0:203051360', old: 'STEAM_1:0:115234', date: 1523283653.81564 } // vice
];

var demoLoadTimeout = 20000;

function playDemo(index)
{
    demo_playback = false;
    demo_loaded = false;
    if (rcon.active)
        rcon.instance().send('volume 0');

    // FIXME:
    // This will skip without attemping to redownload
    if (!demos[index] || !demos[index].player_info || !demos[index].demo_info || !demos[index].tier_info || !demos[index].record_info)
    {
        overlay.drawError('Something went wrong loading the demo, skipping..');
        skip();
        return;
    }

    downloader.getMap(demos[index].demo_info.mapname, (res) =>
    {
        if (res != null)
        {
            // nolem's tempus-api module changes tier_info props to class names instead of numbers
            overlay.update(true, true, '', true, demos[index].player_info.name, demos[index].demo_info.mapname, demos[index].tier_info[demos[index].record_info.class == 3 ? 'soldier' : 'demoman']);

            index = index;

            var dest = `${tfPath + demos[index].demo_info.filename}.dem`;

            // Check if demo file exist
            // Download if doesn't
            // TODO: Clean up this callback same as savePlayCommands
            downloader.getDemoFile(index, (result) =>
            {
                if (result === null)
                {
                    log.printLn('[DL] Error getting demo', log.severity.ERROR);
                    skip();
                    return;
                }
                else if (result === false)
                {
                    log.printLn(`[DL] Demo file ${demos[index].demo_info.filename} exists already!`, log.severity.DEBUG);
                }

                if (demoRetry === 1)
                {
                    // delete corrupt demo
                    fs.unlink(dest, (err) =>
                    {
                        if (err)
                        {
                            if (demo_playback)
                                return;
                            if (err.code === 'ENOENT')
                            {
                                demoRetry = 2;
                                playDemo(index);
                                return;
                            }                                

                            if (err.code === 'EBUSY')
                            {
                                log.printLn('[DL] Demo file still busy, extending FF timeout!', log.severity.WARN);
                                setTimeout((uuid) =>
                                {
                                    if (uuid == callbackUUID)
                                    {
                                        demoRetry = 2;
                                        playDemo(index);
                                    }                                    
                                }, demos[index].record_info.demo_start_tick / 100, callbackUUID);

                                return;
                            }
                            var error_string = `Failed to load<br/>${demos[index].player_info.name} on<br/>${demos[index].demo_info.mapname}<br/>Skipping..`
                            overlay.drawError(error_string);
                            log.printLn('[DL] Error unlinking demo file for redownload!', log.severity.ERROR);
                            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                            demoRetry = 0;
                            skip();
                        }
                        else
                        {
                            demoRetry = 2;
                            playDemo(index);
                        }
                    });
                }
                else
                {
                    startDemo(index);
                }
            });
        }
        else
        {
            overlay.drawError('Something went wrong loading the map, skipping..');
            skip();
        }
    });    
}

function startDemo(index)
{
    // Create a ttv_spec_player.cfg, which will get executed when the demo loads
    // The config just contains a 'spec_player "STEAMID"' command.
    // This cannot be done via rcon because the steamid needs quotes around it source does not like nested quotes that.

    // Check for old steamids (vice)
    var steamid = demos[index].player_info.steamid;
    for (var i = 0; i < old_steamids.length; i++)
    {
        if (old_steamids[i].current === demos[index].player_info.steamid && demos[index].demo_info.date < old_steamids[i].date)
        {
            steamid = old_steamids[i].old;
        }
    }

    // Write the .cfg
    fs.writeFile(tfPath + '/cfg/ttv_spec_player.cfg', `spec_player "${steamid}"`, (err) =>
    {
        if (err)
        {
            log.printLn('[FILE] Could not write ttv_spec_player.cfg!', log.severity.ERROR);
            //twitch.instance().say(`Something went wrong loading the demo, skipping.`);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            if (err.code == 'EMFILE')
                fs.unlink(tfPath + '/cfg/ttv_spec_player.cfg', (err) =>
                {
                    overlay.drawError('Something went wrong loading the demo, skipping..');
                    skip();
                });
            return;
        }

        var startPadding = 400,
            endTimerPadding = 0,
            endPadding = 500;

        // Commands used to control the demo playback
        // rcon ttv_* commands will trigger events in rcon.js
        var commands = [
            { tick: 33, commands: `sensitivity 0; m_yaw 0; m_pitch 0; unbindall; fog_override 1; fog_enable 0; rcon ttv_demo_load; demo_gototick ${demos[index].record_info.demo_start_tick - startPadding}; demo_setendtick ${demos[index].record_info.demo_end_tick + endPadding + 66}` },
            { tick: demos[index].record_info.demo_start_tick - startPadding, commands: `exec ttv_spec_player; spec_mode 4; demo_resume; volume 0.05; rcon ttv_run_start` },
            { tick: demos[index].record_info.demo_start_tick - (startPadding / 4) * 3, commands: `rcon ttv_run_start_timer` },
            { tick: demos[index].record_info.demo_start_tick, commands: `exec ttv_spec_player; spec_mode 4; rcon ttv_run_start_actual` }, //in case player dead before start_tick
            { tick: demos[index].record_info.demo_end_tick - endTimerPadding, commands: 'rcon ttv_run_end_timer' }/*,
            { tick: demos[index].record_info.demo_end_tick + (endPadding / 4) * 3, commands: 'rcon ttv_run_end' },
            { tick: demos[index].record_info.demo_end_tick + endPadding, commands: 'volume 0; rcon ttv_run_next' }*/
        ];

        // Write the play commands
        // TODO: Make this callback less confusing
        savePlayCommands(demos[index].demo_info.filename, commands, (success) =>
        {
            if (success)
            {
                callbackUUID = uuid.v4();

                setTimeout((uuid) =>
                {
                    if (uuid != callbackUUID)
                        return;

                    // demo loading took too long
                    if (!demo_loaded)
                    {
                        if (demoRetry === 2)
                        {
                            demoRetry = 0;
                            if (demos[index])
                            {
                                log.printLn(`[DEMO] Loading ${demos[index].demo_info.filename} timed out, skipping!`, log.severity.ERROR);
                                var error_string = `Failed to load<br/>${demos[index].player_info.name} on<br/>${demos[index].demo_info.mapname}<br/>Skipping..`
                                overlay.drawError(error_string);
                            }

                            skip();
                            return;
                        }
                        else
                        {
                            if (demos[index])
                            {
                                log.printLn(`[DEMO] Loading ${demos[index].demo_info.filename} timed out, redownloading!`, log.severity.WARN);
                                var error_string = `Failed to load<br/>${demos[index].player_info.name} on<br/>${demos[index].demo_info.mapname}<br/>Redownloading..`
                                overlay.drawError(error_string);
                            }

                            demoRetry = 1;
                            playDemo(index);
                            return;
                        }
                    }

                }, demoLoadTimeout, callbackUUID);

                rcon.instance().send(`stopdemo; mat_fullbright 0; volume 0; demo_gototick 0; playdemo ${demos[index].demo_info.filename}`);
                overlay.drawLoadingStatus('Opening demo file');

                // Add to recently played, remove oldest if length > 5
                if (recentDemos.push(demos[index]) > 5)
                    recentDemos.splice(0, 1);

                // TODO:
                // I used to use a scene with game capture and another scene with window capture and a blur filter.
                // The blur scene would be activated when the timer pops up at the end of a run.
                // However, not having a monitor turned on causes window capture to break.
                // Game capture cannot be used for both scenes because it takes a few seconds to start, causing the game to disappear for a while for the viewers.
                // Probably need to wait for https://github.com/Palakis/obs-websocket/blob/4.x-current/docs/generated/protocol.md#setsourcefiltersettings
                // to be added. This would allow us to enable/disable the blur filter as needed instead of changing scenes.

                //obs.instance.setCurrentScene({ 'scene-name': 'Main' })
                //    .catch(err =>
                //    {
                //        log.printLn('[OBS] Failed to switch scene!', log.severity.ERROR);
                //        log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                //    });

            }
            else
            {
                log.printLn('[FILE] FAILED TO WRITE PLAYCOMMANDS', log.severity.ERROR);
            }
        });
    });
}

function getDemos(refresh = false)
{
    if (!refresh)
    {
        overlay.update(true, true);
        overlay.drawLoadingStatus('Downloading times from tempus');
    }

    config.loadNicks((err, nicks) =>
    {
        // Don't care if loading nicknames returns error, will just use names from tempus
        tempus.detailedMapList().then((detailedMapList) =>
        {
            if (!detailedMapList)
                return;

            var i = 0;
            while (i < detailedMapList.length)
            {                 
                for (var e = 0; e < 2; e++)
                {
                    var classStr = (e == 0 ? 'd' : 's');

                    setTimeout((detailedMapList, i, classStr) =>
                    {
                        tempus.mapWR(detailedMapList[i].name, classStr).then((x) => x.toRecordOverview().then((record) =>
                        {
                            if (!record)
                                return;

                            // nolem's tempus-api module moves all properties from record_info onto the parent object
                            // I'm too lazy to change all mentions of record_info so remake it here
                            record.record_info = {
                                "demo_id": record.demo_id,
                                "server_id": record.server_id,
                                "user_id": record.user_id,
                                "zone_id": record.zone_id,
                                "demo_start_tick": record.demo_start_tick,
                                "rank": record.rank,
                                "class": record.class,
                                "date": record.date,
                                "duration": record.duration,
                                "demo_end_tick": record.demo_end_tick,
                                "id": record.id
                            };      

                            delete record.demo_id,
                                record.server_id,
                                record.user_id,
                                record.zone_id,
                                record.demo_start_tick,
                                record.rank,
                                record.class,
                                record.date,
                                record.duration,
                                record.demo_end_tick,
                                record.id;

                            // Sanity checking
                            if (!record.record_info)
                            {
                                log.printLn(`[TEMPUS] Record is missing record_info!`, log.severity.WARN);
                                return;
                            }
                            if (!record.demo_info)
                            {
                                log.printLn(`[TEMPUS] Record is missing demo_info!`, log.severity.WARN);
                                return;
                            }
                            if (!record.player_info)
                            {
                                log.printLn(`[TEMPUS] Record is missing player_info!`, log.severity.WARN);
                                return;
                            }
                            if (!record.tier_info)
                            {
                                log.printLn(`[TEMPUS] Record is missing tier_info!`, log.severity.WARN);
                                return;
                            }
                            if (!record.zone_info)
                            {
                                log.printLn(`[TEMPUS] Record is missing zone_info!`, log.severity.WARN);
                                return;
                            }

                            // Check if player has a nick assigned
                            if (nicks && record.player_info)
                            {
                                for (var i = 0; i < nicks.length; i++)
                                {
                                    if (record.player_info.steamid == nicks[i].steamid)
                                        record.player_info.name = nicks[i].name;
                                }
                            }

                            // Check if run is blacklisted
                            for (var x = 0; x < demoBlacklist.length; x++)
                            {
                                if (demoBlacklist[x].map.includes(record.demo_info.mapname) && demoBlacklist[x].class == record.record_info.class)
                                {
                                    record.blacklisted = true;
                                }
                            }

                            if (record.demo_info.url && record.demo_info.url.length > 0)
                            {
                                // Are we doing an initial load or refreshing runs?
                                // TODO: Monitor activity instead of refreshing runs every x minutes
                                if (refresh)
                                {
                                    tempDemos.push(record);
                                }
                                else
                                {
                                    demos.push(record);

                                    // TODO: Figure out less spammy way of printing progress
                                    if (demos.length > 940)
                                        log.printLnNoStamp(`[TEMPUS] Fetched ${demos.length} records!`, log.severity.DEBUG);
                                    else
                                        if (demos.length % 100 == 0)
                                            log.printLnNoStamp(`[TEMPUS] Fetched ${demos.length} records!`, log.severity.DEBUG);
                                }
                            }
                            else
                            {
                                log.printLn(`[TEMPUS] Record is missing demo_info.url!`);
                            }
                        })
                            .catch((err) =>
                            {
                                log.printLn(`[TEMPUS] Couldn't get record overview for ${classStr == 's' ? 'soldier' : 'demoman'} ${detailedMapList[i].name}`, log.severity.ERROR);
                                log.printLnNoStamp(err, log.severity.DEBUG);
                            }))
                            .catch((err) =>
                            {
                                // tier 0 maps will fail to get wr
                                if (detailedMapList[i].tiers[classStr == 's' ? 'soldier' : 'demoman'] != 0)
                                {
                                    log.printLn(`[TEMPUS] Couldn't get map wr for ${classStr == 's' ? 'soldier' : 'demoman'} ${detailedMapList[i].name}`, log.severity.ERROR);
                                    log.printLnNoStamp(err, log.severity.DEBUG);
                                }
                            });
                    // Be kind to tempus api
                    }, i * 100 + e * 50, detailedMapList, i, classStr);
                }

                i++;
            }
        });
    });
}

// Save play commands to control the demo playback
function savePlayCommands(filename, commands, cb)
{
    if (!cb || typeof (cb) !== 'function')
        throw ('callback is not a function');

    var data = `demoactions\n{\n`;

    for (var i = 0; i < commands.length; i++)
    {
        data +=
            `   "${i + 1}"\n` +
            '   {\n' +
            '       factory "PlayCommands"\n' +
            `       name "TTV${i + 1}"\n` +
            `       starttick "${commands[i].tick}"\n` +
            `       commands "${commands[i].commands}"\n` +
            '   }\n';
    }

    data += '\n}'

    fs.writeFile(tfPath + filename + '.vdm', data, {}, (err) =>
    {
        if (err)
        {
            log.printLn('[FILE] Error saving PlayCommands!', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            return cb(false);
        }

        return cb(true);
    });
}

// Shuffle demos array
function shuffle()
{
    var currentIndex = demos.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex !== 0)
    {

        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = demos[currentIndex];
        demos[currentIndex] = demos[randomIndex];
        demos[randomIndex] = temporaryValue;
    }
}

// Play the most voted map, prioritize old votes if equal amounts
function playVoted(peek = false)
{
    var most = 0;
    if(runVotes.length == 0 && peek == true)
    {
        if(currentDemo + 1 < demos.length)
            return demos[currentDemo+1];
        else
            return demos[0];
    }
    for (var i = 0; i < runVotes.length; i++)
    {
        if (runVotes[i].users.length > runVotes[most].users.length)
            most = i;
    }
    var target = -1;
    for (var i = 0; i < demos.length; i++)
    {
        // Compare demo objects instead of only the filename,
        // in case there are multiple records on the same demo file
        if (demos[i] === runVotes[most].demo)
            target = i;
    }
    if (target != -1)
    {
        var fromIndex = target;
        var toIndex = currentDemo + 1;
        if (toIndex === demos.length)
            toIndex = 0;
        var element = demos[fromIndex];
        demos.splice(fromIndex, 1);
        demos.splice(toIndex, 0, element);

        if (peek == false) 
        {
            runVotes.splice(most, 1);
            log.printLn(`[VOTES] Removed votes for ${demos[0].demo_info.filename}`, log.severity.DEBUG);
        }
        currentDemo = toIndex;
        if (peek == true) 
        {
            return demos[currentDemo];
        }
        else 
        {
            playDemo(currentDemo);
        }
    }
    else
    {
        log.printLn('[VOTES] Error: target == -1', log.severity.ERROR);
        runVotes.splice(most, 1);
        log.printLn(`[VOTES] Removed votes for ${demos[0].demo_info.filename}`, log.severity.DEBUG);
        if(peek == false)
        {
            skip();
        }
        else
        {
            return playVoted(true);
        }
    }
}

// Skip the current demo
function skip()
{
    userSkips = [];

    // Check for votes
    for (var i = 0; i < runVotes.length; i++)
    {
        if (runVotes[i].users.length != 0)
        {
            playVoted();
            return;
        }
    }

    currentDemo++;
    if (currentDemo < demos.length)
    {
        playDemo(currentDemo);
    }
    else
    {
        playDemo(0);
    }
}

function init()
{
    if (demos != null && demos.length > 0)
    {
        log.printLn('Shuffling demos and starting playback!', log.severity.INFO);
        shuffle(demos);
        currentDemo = 0;
        playDemo(0);
    }
}

module.exports.init = init;
module.exports.skip = skip;
module.exports.playVoted = playVoted;
module.exports.getDemos = getDemos;
module.exports.shuffle = shuffle;
module.exports.playDemo = playDemo;
