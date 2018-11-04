var OBSWebSocket = require('obs-websocket-js'),
    obs = new OBSWebSocket(),
    connected = false,
    log = require('./log.js'),
    config = require('./config.js');

function connect()
{
    obs.connect()
        .then(() =>
        {
            log.printLn('[OBS] Connected!', log.severity.INFO);
            connected = true;
        })
        .catch(err =>
        {
            log.printLn('[OBS] Connection error! Retrying in 5 seconds.', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            connected = false;
        });
}

function init()
{
    obs.on('ConnectionOpened', (data) =>
    {
        log.printLn('[OBS] Connected!', log.severity.INFO);
        connected = true;

        config.loadCfg((err, cfg) =>
        {
            if (cfg.obs.autoStart.streaming)
            {
                obs.getStreamingStatus()
                    .then(status =>
                    {
                        if (!status.streaming)
                            obs.startStreaming()
                                .then(() =>
                                {
                                    log.printLn('[OBS] Started stream', log.severity.DEBUG);
                                })
                                .catch(err =>
                                {
                                    log.printLn('[OBS] Failed to start stream', log.severity.ERROR);
                                    log.printLnNoStamp(err, log.severity.ERROR);
                                });
                    })
                    .catch(err =>
                    {
                        log.printLn('[OBS] Failed to get streaming status', log.severity.ERROR);
                        log.printLnNoStamp(err, log.severity.ERROR);
                    });
            }
            if (cfg.obs.autoStart.recording)
            {
                obs.getRecordingStatus()
                    .then(status =>
                    {
                        if (!status.recording)
                            obs.startRecording()
                                .then(() =>
                                {
                                    log.printLn('[OBS] Started recording', log.severity.DEBUG);
                                })
                                .catch(err =>
                                {
                                    log.printLn('[OBS] Failed to start recording', log.severity.ERROR);
                                    log.printLnNoStamp(err, log.severity.ERROR);
                                });
                    })
                    .catch(err =>
                    {
                        log.printLn('[OBS] Failed to get recording status', log.severity.ERROR);
                        log.printLnNoStamp(err, log.severity.ERROR);
                    });
            }
        });
        
    })
    .on('ConnectionClosed', (data) =>
    {
        log.printLn('[OBS] Connection closed!', log.severity.WARN);
        connected = false;
        setTimeout(() =>
        {
            obs.connect()
                .catch(err =>
                {
                    log.printLn('[OBS] Socket error!', log.severity.ERROR);
                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                });
        }, 5000);
    })
    .on('AuthenticationFailure', (data) =>
    {
        log.printLn('[OBS] Authentication failed!', log.severity.WARN);
    })
    .on('AuthenticationSuccess', (data) =>
    {
        log.printLn('[OBS] Authentication succeeded!', log.severity.INFO);
    })
    .on('error', (err) =>
    {
        log.printLn('[OBS] Socket error!', log.severity.ERROR);
        log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
    });
}

module.exports.init = init;
module.exports.connect = connect;
module.exports.connected = connected;
module.exports.instance = obs;