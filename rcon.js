var rcon = require('rcon'),
    conn,
    net = require('net'),
    utils = require('./utils.js'),
    log = require('./log.js'),
    active = false,
    demo = require('./demo.js'),
    app = require('./app.js'),
    obs = require('./obs.js'),
    overlay = require('./overlay.js'),
    config = require('./config.js');

var restarting = false;

function init()
{
    config.loadCfg((err, cfg) =>
    {
        if (err) return;
        console.log(cfg.rcon.address + ':' + cfg.rcon.port + ':' + cfg.rcon.password);
        conn = new rcon(cfg.rcon.address, cfg.rcon.port, cfg.rcon.password);

        conn.on('auth', () =>
        {
            log.printLn('[RCON] Authenticated!', log.severity.INFO);
            conn.send('disconnect; exec cinema; volume 0; rcon_address 127.0.0.1:3002');
            active = true;
            if (restarting)
            {
                restarting = false;
                demo.playDemo(currentDemo);
            }

        }).on('response', (str) =>
        {
            if (str.length === 0)
            {
                // For some reason auth doesn't get called again when restarting TF2 so start playback here after restart
                if (restarting)
                {
                    log.printLn('[RCON] Authenticated!', log.severity.INFO);
                    conn.send('disconnect; exec cinema; volume 0; rcon_address 127.0.0.1:3002');
                    active = true;
                    restarting = false;
                    demo.playDemo(currentDemo);
                }

                log.printLn('[RCON] Received empty response', log.severity.DEBUG);
                return;
            }
            log.printLn('[RCON] Received response: ' + str, log.severity.DEBUG);

        }).on('end', () =>
        {
            log.printLn('[RCON] Socket closed!', log.severity.INFO);
            active = false;

        }).on('error', (err) =>
        {
            active = false;
            if (err.code === 'ECONNREFUSED')
            {
                log.printLn(`[RCON] Could not connect to ${conn.host}:${conn.port}!`, log.severity.WARN);
                setTimeout(() =>
                {
                    conn.connect();
                }, 5000);
            }
            else if (err.code === 'ECONNRESET')
            {
                log.printLn('[RCON] Connection reset!', log.severity.ERROR);

                restartTF2();
            }
            else if (err.code === 'EPIPE')
            {
                log.printLn('[RCON] Socket closed by other party!', log.severity.ERROR);

                restartTF2();
            }
            else
            {
                log.printLn('[RCON] Encountered unhandled error!', log.severity.ERROR);
                log.printLnNoStamp(err);

                restartTF2();
            }
        });
        try
        {
            conn.connect();
        }
        catch (err)
        {
            log.printLn('[RCON] Socket closed!', log.severity.ERROR);
            log.printLnNoStamp(err, log.severity.DEBUG)

            restartTF2();
        }
    });
}

// Restart tf2 if rcon socket encounters an error.
// This *should* only happen if tf2 crashes.
// This will not get called if you type 'exit' in console.
function restartTF2()
{
    // start tf2 again and restart same demo
    app.startTF2();
    restarting = true;
    callbackUUID = -1;
    overlay.update(true, true);
    overlay.drawLoadingStatus('TF2 crashed, restarting..');
    setTimeout(() =>
    {
        conn.connect();
    }, 5000);
}

// Listen for play commands
var srv = net.createServer(function (sock)
{
    sock.on('data', function (data)
    {
        log.printLn('Received RCON data: ' + JSON.stringify(data), log.severity.DEBUG);

        if (!app_running)
            return;

        if (data.toString().includes('ttv_demo_load'))
        {
            log.printLn('[DEMO] LOADED', log.severity.INFO);
            overlay.drawLoadingStatus('Fast forwarding to run');
            demo_loaded = true;
            runStartTimeout = 5000 + demos[currentDemo].record_info.demo_start_tick / 25;
            setTimeout((uuid) =>
            {
                if (uuid != callbackUUID)
                    return;

                // demo loading took too long
                if (!playback && demo_loaded)
                {
                    if (demoRetry === 2)
                    {
                        demoRetry = 0;
                        log.printLn(`[DEMO] Fast forwarding ${demos[currentDemo].demo_info.filename} timed out, skipping!`, log.severity.ERROR);
                        var error_string = `Failed to load<br/>${demos[currentDemo].player_info.name} on<br/>${demos[currentDemo].demo_info.mapname}<br/>Tier ${demos[currentDemo].tier_info[demos[currentDemo].record_info.class == 3 ? 'soldier' : 'demoman']} | ${demos[currentDemo].record_info.class === 4 ? 'Demoman' : 'Soldier'}<br/>Skipping..`
                        overlay.drawError(error_string);
                        demo.skip();
                        return;
                    }
                    else
                    {
                        log.printLn(`[DEMO] Fast forwarding ${demos[currentDemo].demo_info.filename} timed out, redownloading demo!`, log.severity.WARN);
                        var error_string = `Failed to load<br/>${demos[currentDemo].player_info.name} on<br/>${demos[currentDemo].demo_info.mapname}<br/>Tier ${demos[currentDemo].tier_info[demos[currentDemo].record_info.class == 3 ? 'soldier' : 'demoman']} | ${demos[currentDemo].record_info.class === 4 ? 'Demoman' : 'Soldier'}<br/>Redownloading..`
                        overlay.drawError(error_string);
                        demoRetry = 1;
                        demo.playDemo(demos[currentDemo]);
                        return;
                    }
                }

            }, runStartTimeout, callbackUUID);
            return;
        }
        if (data.toString().includes('ttv_run_start_timer') && playback)
        {
            overlay.drawLoadingStatus();
            return;
        }
        if (data.toString().includes('ttv_run_start') && demo_loaded)
        {
            log.printLn('[DEMO] RUN START', log.severity.INFO);
            if (demos[currentDemo] != null)
                overlay.update(false, false, '', true, demos[currentDemo].player_info.name, demos[currentDemo].demo_info.mapname, demos[currentDemo].tier_info[demos[currentDemo].record_info.class == 3 ? 'soldier' : 'demoman']);
            overlay.drawLoadingStatus('Done');
            playback = true;

            return;
        }
        if (data.toString().includes('ttv_run_end_timer') && playback)
        {
            log.printLn('[DEMO] END TIMER', log.severity.INFO);
            if (demos[currentDemo] != null)
                overlay.update(true, false, utils.msToTimeStamp(demos[currentDemo].record_info.duration * 1000), true, demos[currentDemo].player_info.name, demos[currentDemo].demo_info.mapname, demos[currentDemo].tier_info[demos[currentDemo].record_info.class == 3 ? 'soldier' : 'demoman']);


            // TODO:
            // I used to use a scene with game capture and another scene with window capture and a blur filter.
            // The blur scene would be activated when the timer pops up at the end of a run.
            // However, not having a monitor turned on causes window capture to break.
            // Game capture cannot be used for both scenes because it takes a few seconds to start, causing the game to disappear for a while for the viewers.
            // Probably need to wait for https://github.com/Palakis/obs-websocket/blob/4.x-current/docs/generated/protocol.md#setsourcefiltersettings
            // to be added. This would allow us to enable/disable the blur filter as needed instead of changing scenes.

            //obs.instance.setCurrentScene({ 'scene-name': 'Blur' })
            //    .catch(err =>
            //    {
            //        log.printLn('[OBS] Failed to switch scene!', log.severity.ERROR);
            //        log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            //    });

            overlay.drawVotes();
            return;
        }
        if (data.toString().includes('ttv_run_end') && playback)
        {
            log.printLn('[DEMO] RUN END', log.severity.INFO);
            if (demos[currentDemo] != null)
                overlay.update(true, true);

            return;
        }
        if (data.toString().includes('ttv_run_next') && playback)
        {
            log.printLn('[DEMO] RUN NEXT', log.severity.INFO);
            overlay.drawLoadingStatus('Selecting next demo');
            demo.skip();
            return;
        }
    })
    .on('error', (err) =>
    {
        log.printLn(err);
    });
});

config.loadCfg((err, cfg) =>
{
    if (err) return;

    srv.listen(cfg.rcon.listenPort, cfg.rcon.listenAddress);
    log.printLn(`[RCON] Listening on ${cfg.rcon.listenAddress}:${cfg.rcon.listenPort}`, log.severity.INFO);
});

function instance()
{
    return conn;
}

module.exports.init = init;
module.exports.instance = instance;
module.exports.active = active;