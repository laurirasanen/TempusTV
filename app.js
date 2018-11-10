'use strict';

var log = require('./log.js'),
    overlay = require('./overlay.js'),
    rcon = require('./rcon.js'),
    obs = require('./obs.js'),
    twitch = require('./twitch.js'),
    demo = require('./demo.js'),
    utils = require('./utils.js'),
    stdio = require('./stdio.js'),
    utils = require('./utils.js'),
    config = require('./config.js'),
    dl = require('./downloader.js');

var http = require('http'),
    express = require('express'),
    path = require('path'),
    url = require('url'),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server),
    exec = require('child_process').execFile;

// TODO: Clean up these globals
var app_loaded = false,
    pre_demos = false,
    pre_maps = false,
    pre_mapsArr = [];

global.app_running = false,
global.demo_loaded = false,
global.demo_playback = false,
global.currentDemo = 0,
global.demos = [],
global.tempDemos = [],
global.recentDemos = [],
global.callbackUUID,
global.runVotes = [],
global.userSkips = [];
global.demoBlacklist = [];
global.demoRetry = 0;
global.runStartTimeout = 30000;
global.tfPath = '';

app.use('/public', express.static(path.join(__dirname, 'public')))

var launchCmd, obsCmd;

function startTF2()
{
    log.printLn('Launching TF2', log.severity.INFO);

    exec(launchCmd, null, { shell: true }, function (err, data)
    {
        if(err)
            console.log(err)
    }); 
}

function load()
{
    if (app_loaded)
    {
        log.printLn('Already loaded!', log.severity.DEBUG);
        return;
    }
    app_loaded = true;

    config.loadCfg((err, cfg) =>
    {
        if (err) throw err;

        if (cfg.obs.autoLaunch)
        {
            exec(obsCmd, null, { shell: true }, function (err, data)
            {
                if (err)
                    console.log(err)
            });

            obs.init();
            obs.instance.connect()
                .catch(err =>
                {
                    log.printLn('[OBS] Socket error!', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                });
        }
        server.listen(cfg.overlay.port);

        if (!cfg.tv.preDownload)
            demo.getDemos();
    });

    startTF2();
    rcon.init();
    
    // Refresh runs every 10 mins
    // TODO: Monitor tempus activity instead
    setTimeout(refresh, 10 * 60 * 1000);
}

function refresh()
{
    log.printLn('[TEMPUS] Checking for new runs..', log.severity.INFO);
    demo.getDemos(true);
    setTimeout(() =>
    {
        for (var i = 0; i < demos.length; i++) {
            for (var e = 0; e < tempDemos.length; e++) {
                if (demos[i].record_info.id === tempDemos[e].record_info.id)
                    tempDemos.splice(e, 1);
            }
        }
        while (tempDemos.length > 0)
        {
            var found = false;
            for (var i = 0; i < demos.length; i++) {
                if (demos[i].demo_info.mapname === tempDemos[0].demo_info.mapname && demos[i].record_info.class === tempDemos[0].record_info.class && tempDemos[0].record_info.date > demos[i].record_info.date) {
                    if (i === currentDemo)
                    {
                        // Dont delete demo if currently playing
                        log.printLn(`[TEMPUS] Found new run but skipping because it is currently being played`, log.severity.WARN);
                    }
                    else
                    {
                        log.printLn(`[TEMPUS] Replacing run: '${demos[i].player_info.name} on ${demos[i].demo_info.mapname} as ${demos[i].record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demos[i].record_info.duration * 1000)})'\n
                                with '${tempDemos[0].player_info.name} on ${tempDemos[0].demo_info.mapname} as ${tempDemos[0].record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(tempDemos[0].record_info.duration * 1000)})'!`, log.severity.INFO);
                        demos.splice(i, 1, tempDemos[0]);
                        if(twitch.instance())
                            twitch.instance().say(`New run added: '${demos[i].player_info.name} on ${demos[i].demo_info.mapname} as ${demos[i].record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demos[i].record_info.duration * 1000)})'!`);
                    }

                    tempDemos.splice(0, 1);
                    found = true;
                    break;
                }
            }
            if (!found) {
                // No existing run
                log.printLn(`[TEMPUS] Added new run: '${tempDemos[0].player_info.name} on ${tempDemos[0].demo_info.mapname} as ${tempDemos[0].record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(tempDemos[0].record_info.duration * 1000)})'!`, log.severity.INFO);
                demos.push(tempDemos[0]);
                tempDemos.splice(0, 1);
                if (twitch.instance())
                    twitch.instance().say(`New run added: '${demos[demos.length - 1].player_info.name} on ${demos[demos.length - 1].demo_info.mapname} as ${demos[demos.length - 1].record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demos[demos.length - 1].record_info.duration * 1000)})'!`);
            }
        }
    }, 60 * 1000);
    setTimeout(refresh, 10 * 60 * 1000);
}

function start()
{
    if (app_running)
    {
        log.printLn('Already running!', log.severity.INFO);
        return;
    }
    app_running = true;
    demo.init();
}

function stop()
{
    app_running = false;
    app_loaded = false;
    obs.instance.disconnect();
    rcon.instance().disconnect();
    utils.cleanUp();
}

function loadAll()
{
    demo.getDemos();
    setTimeout(() =>
    {
        if (demos.length > 0)
        {
            log.printLn('Starting download for all maps and demo files!', log.severity.WARN);
            getDemoFile(0);

            for (var i = 0; i < demos.length; i++)
            {
                if (!demos[i].demo_info.mapname)
                    continue;

                if (!pre_mapsArr.includes(demos[i].demo_info.mapname))
                    pre_mapsArr.push(demos[i].demo_info.mapname);
            }  

            getMap(0);
        }
    }, 60 * 1000);
}

function getDemoFile(index)
{
    log.printLn(`Downloading demo file ${demos[index].demo_info.filename} (${index+1}/${demos.length})`, log.severity.INFO);
    dl.getDemoFile(index, (res) =>
    {
        if (index + 1 < demos.length)
            getDemoFile(index + 1);
        else
        {
            pre_demos = true;
            log.printLn('Finished downloading demos files!', log.severity.WARN);

            if (pre_maps)
                init();
        }
    });
}

function getMap(index)
{
    log.printLn(`Downloading map ${pre_mapsArr[index]} (${index + 1}/${pre_mapsArr.length})`, log.severity.INFO);
    dl.getMap(pre_mapsArr[index], (res) =>
    {
        if (index + 1 < pre_mapsArr.length)
            getMap(index + 1);
        else
        {
            pre_maps = true;
            log.printLn('Finished downloading maps!', log.severity.WARN);

            if (pre_demos)
                init();  
        }
    });
}

// Serve overlay to obs
app.get('/overlay', function (req, res)
{
    res.sendFile(path.join(__dirname, '/public/www/overlay.html'));
});

config.loadCfg((err, cfg) =>
{
    if (err) return;

    tfPath = cfg.tf2.tfPath;

    // FIXME: This will only work with obs64, use regex to check if 32 or 64
    // obs wants working directory to be same as the .exe location
    // use cd /d
    obsCmd = `cd /d ${cfg.obs.path.split('obs64.exe')[0]}" && .\\obs64.exe`;
    launchCmd = cfg.steam.path + ` -applaunch ${cfg.steam.game}`;
    for (var i = 0; i < cfg.tf2.launchOptions.length; i++)
        launchCmd += ` ${cfg.tf2.launchOptions[i]}`;

    if (cfg.tv.preDownload)
    {
        log.printLnNoStamp('Predownloading all maps and demo files.\nPlayback will start once finished!', log.severity.WARN);
        loadAll();
        return;
    }        
});

function init()
{
    load();
    config.loadCfg((err, cfg) =>
    {
        // FIXME
        // use a callback instead of guessing how long it takes to load TF2 and tempus api stuff
        if (cfg.tv.autoStart)
            setTimeout(start, 60 * 1000);
    });    
}

process.on('uncaughtException', (err) =>
{
    log.printLn(`uncaughtException: ${err.message}`, log.severity.ERROR);
    log.printLnNoStamp(err.stack, log.severity.DEBUG);
    log.error(err);

    config.loadCfg((err, cfg) =>
    {
        if (err) return;

        if (cfg.tv.rebootOnException)
        {
            exec('"C:\\Windows\\System32\\cmd.exe" /k shutdown /f /r /t 0', null, { shell: true }, function (err, data)
            {
                if (err)
                    console.log(err);
            });
        }
    });
});

// Server instance for overlay io socket
module.exports.server = server;
module.exports.load = load;
module.exports.start = start;
module.exports.stop = stop;
module.exports.io = io;
module.exports.startTF2 = startTF2;