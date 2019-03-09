var log = require('./log.js'),
    twitchBot = require('twitch-bot'),
    utils = require('./utils.js'),
    demoC = require('./demo.js'),
    https = require('https'),
    fuzzy = require('fuzzy-matching'),
    rcon = require('./rcon.js'),
    config = require('./config.js'),
    exec = require('child_process').execFile,
    config = require('./config.js'),
    tempus = require('tempus-api'),
    Bot = null,
    connections = [];

function reboot()
{
    exec('"C:\\Windows\\System32\\cmd.exe" /k shutdown /f /r /t 0', null, { shell: true }, function (err, data)
    {
        if (err)
            console.log(err);
    });

}
// FIXME:
// This is a duplicate of startTF2() in app.js
// Cannot require('./app.js') here due to circular requirement
function startTF2()
{
    var launchCmd = '"C:\\Program Files (x86)\\Steam\\Steam.exe" -applaunch 440 -novid -high -autoconfig -dxlevel 98 -windowed -noborder -hijack -nocrashdialog -w 1920 -h 1080 +exec cinema +ip 127.0.0.1 -usercon +rcon_password bananaman +map itemtest';
    log.printLn('Launching TF2', log.severity.INFO);

    exec(launchCmd, null, { shell: true }, function (err, data)
    {
        if (err)
            console.log(err);
    });
}

function instance()
{
    return null;
};

// Initialize bot from cfg
config.loadCfg((err, cfg) =>
{
    if (err) return;

    if (cfg.twitch.enable)
    {
        Bot = new twitchBot({
            username: cfg.twitch.username,
            oauth: cfg.twitch.oauth,
            channels: cfg.twitch.channels
        });

        for (var i = 0; i < cfg.twitch.channels.length; i++)
            connections.push({ name: cfg.twitch.channels[i], connected: false });

        Bot.on('join', (channel) =>
        {
            log.printLn(`[TWITCH] Joined ${channel}`, log.severity.INFO);
            for (var i = 0; i < connections.length; i++)
                if (connections[i].name == channel)
                    connections[i].connected = true;
        });

        Bot.on('message', (chatter) =>
        {
            // ignore bots
            if (chatter.name === 'tempusbotty' || chatter.name === 'nightbot')
                return;

            if (chatter.message === '!skip' || chatter.message === '!rtv')
            {
                log.printLn('app_running: ' + app_running, log.severity.DEBUG);
                if (!app_running)
                {
                    Bot.say('!skip is not available right now.');
                    return;
                }
                cfg.loadCfg((cfg, err) =>
                {
                    if (err)
                    {
                        log.error(err);
                        return;
                    }

                    https.get(`https://api.twitch.tv/kraken/streams/tempusrecords?client_id=${cfg.twitch.client_id}`, (res) =>
                    {
                        log.printLn(res, log.severity.DEBUG);
                        var str = '';
                        res.on('data', (chunk) =>
                        {
                            str += chunk;
                        })
                            .on('end', () =>
                            {
                                log.printLn('[TWITCH] response from api.twitch.tv', log.severity.INFO);
                                var data = {};
                                try
                                {
                                    data = JSON.parse(str);
                                }
                                catch (err)
                                {
                                    log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
                                    Bot.say('!skip is not available right now.');
                                    return;
                                }
                                //log.printLn('data: ' + JSON.stringify(data), log.severity.DEBUG);

                                if (!data || !data.stream || !data.stream.viewers)
                                {
                                    Bot.say('!skip is not available right now.');
                                    return;
                                }

                                log.printLn('[TWITCH] Received skip_request from twitch chat!', log.severity.INFO);

                                var already = false;

                                if (!userSkips.includes(chatter.username))
                                    userSkips.push(chatter.username);
                                else
                                    already = true;

                                var votes = userSkips.length;
                                var required = Math.ceil(data.stream.viewers / 8);

                                var message = '';

                                if (votes >= required)
                                {
                                    if (already)
                                        message = `@${chatter.username} you've already voted to skip! Total votes ${votes}/${required}. Skipping run!`;
                                    else
                                        message = `${chatter.username} voted to skip the current run. Total votes ${votes}/${required}. Skipping run!`;
                                    demoC.skip();
                                }
                                else
                                {
                                    if (already)
                                        message = `@${chatter.username} you've already voted to skip! Total votes ${votes}/${required}.`;
                                    else
                                        message = `${chatter.username} voted to skip the current run. Total votes ${votes}/${required}.`;
                                }
                                Bot.say(message);
                            });
                    });
                });
            }
            if (chatter.message.startsWith('!vote ') || chatter.message.startsWith('!nom '))
            {
                if (!app_running)
                {
                    Bot.say('!vote is not available right now.');
                    return;
                }

                var map_string = chatter.message.split(' ')[1];
                var class_string = chatter.message.split(' ')[2];
                if (!map_string || map_string.length < 0)
                {
                    return;
                }
                if (!class_string || class_string.length < 0)
                {
                    return;
                }

                var fm = new fuzzy(['soldier', 'solly', 'demo', 'demoman']);
                var match = fm.get(class_string).value;

                var class_number = match == 'demoman' ? 4 : match == 'demo' ? 4 : match == 'solly' ? 3 : 3;

                var map_name = '', demo = null;

                fm = new fuzzy();

                for (var i = 0; i < demos.length; i++)
                    fm.add(demos[i].demo_info.mapname);

                map_name = fm.get(map_string).value;

                for (var i = 0; i < demos.length; i++)
                {
                    if (demos[i].demo_info.mapname == map_name && demos[i].record_info.class == class_number)
                    {
                        demo = demos[i];
                        break;
                    }
                }

                if (demo === null)
                {
                    Bot.say(`Uh-oh. Something went wrong finding demo for "${map_string} | ${class_string}"`);
                    return;
                }
                else
                {
                    if (demo === demos[currentDemo])
                    {
                        Bot.say(`Can't vote for current run!`);
                        return;
                    }
                    if (demo.blacklisted)
                    {
                        Bot.say(`${demo.record_info.class == 4 ? 'demoman' : 'soldier'} on ${demo.demo_info.mapname} is blacklisted!`);
                        return;
                    }
                    //if (demo.record_info.duration > 900)
                    //{
                    //    Bot.say(`Can't vote for ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} on ${demo.demo_info.mapname}. Runs exceeding 15 minutes are blacklisted!`);
                    //    return;
                    //}
                    if (recentDemos.includes(demo))
                    {
                        Bot.say(`@${chatter.username}, '${demo.player_info.name} on ${demo.demo_info.mapname} as ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demo.record_info.duration * 1000)})' was recently played and cannot be voted for.`);
                        return;
                    }

                    var hasVoted = false,
                        voteExists = false;

                    for (var i = 0; i < runVotes.length; i++)
                    {
                        for (var e = 0; e < runVotes[i].users.length; e++)
                        {
                            if (runVotes[i].users[e] === chatter.username)
                            {
                                hasVoted = true;
                                // remove old vote
                                runVotes[i].users.splice(e, 1);
                            }
                        }
                        if (runVotes[i].demo == demo)
                        {
                            voteExists = true;
                            runVotes[i].users.push(chatter.username);
                        }
                    }
                    if (!voteExists)
                    {
                        var vote = { demo: demo, users: [chatter.username] };
                        runVotes.push(vote);
                    }
                    //log.printLn('runVotes: ' + JSON.stringify(runVotes), log.severity.DEBUG);
                    if (hasVoted)
                    {
                        Bot.say(`${chatter.username} changed their vote to '${demo.player_info.name} on ${demo.demo_info.mapname} as ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demo.record_info.duration * 1000)})'!`);
                        return;
                    }

                    Bot.say(`${chatter.username} voted for '${demo.player_info.name} on ${demo.demo_info.mapname} as ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demo.record_info.duration * 1000)})'!`);
                }
            }
            if (chatter.message === '!forceskip' && (chatter.mod === true || chatter.username === 'tempusrecords'))
            {
                log.printLn(`[TWITCH] ${chatter.username} used !forceskip, message: ${chatter.message}`, log.severity.DEBUG);
                if (!app_running)
                {
                    Bot.say('!forceskip is not available right now.');
                    return;
                }

                demoC.skip();
                Bot.say(`@${chatter.username} skipped the current run!`);
            }
            if (chatter.message.startsWith('!setnextrun ') && (chatter.mod === true || chatter.username === 'tempusrecords'))
            {
                log.printLn(`[TWITCH] ${chatter.username} used !setnextrun, message: ${chatter.message}`, log.severity.DEBUG);
                if (!app_running)
                {
                    Bot.say('!setnextrun is not available right now.');
                    return;
                }

                var map_string = chatter.message.split(' ')[1];
                var class_string = chatter.message.split(' ')[2];
                if (!map_string || map_string.length < 0)
                {
                    return;
                }
                if (!class_string || class_string.length < 0)
                {
                    return;
                }

                var fm = new fuzzy(['soldier', 'solly', 'demo', 'demoman']);
                var match = fm.get(class_string).value;

                var class_number = match == 'demoman' ? 4 : match == 'demo' ? 4 : match == 'solly' ? 3 : 3;
                log.printLn('class_string: ' + class_string, log.severity.DEBUG);
                log.printLn('class_number: ' + class_number, log.severity.DEBUG);

                var map_name = '', demo = null;

                fm = new fuzzy();

                for (var i = 0; i < demos.length; i++)
                    fm.add(demos[i].demo_info.mapname);

                map_name = fm.get(map_string).value;

                for (var i = 0; i < demos.length; i++)
                {
                    if (demos[i].demo_info.mapname == map_name && demos[i].record_info.class == class_number)
                    {
                        demo = demos[i];
                        break;
                    }
                }

                if (demo != null)
                {
                    var voteExists = false;
                    var users = [];
                    for (var i = 0; i < 1000; i++)
                        users.push(chatter.username);

                    for (var i = 0; i < runVotes.length; i++)
                    {
                        if (runVotes[i].demo == demo)
                        {
                            voteExists = true;
                            runVotes[i].users = users;
                        }
                    }
                    if (!voteExists)
                    {
                        var vote = { demo: demo, users: users };
                        runVotes.push(vote);
                    }
                    Bot.say(`@${chatter.username} set next map '${demo.player_info.name} on ${demo.demo_info.mapname} as ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demo.record_info.duration * 1000)})'!`);
                }
                else
                {
                    Bot.say(`@${chatter.username} couldn't find a run for '${map_string} ${class_string}'`);
                }
            }
            if (chatter.message === '!nextrun' || chatter.message === '!nextmap')
            {
                //Do we need to log this?
                //log.printLn(`[TWITCH] ${chatter.username} used !nextrun, message: ${chatter.message}`, log.severity.DEBUG); 
                if (!app_running)
                {
                    Bot.say('!nextrun is not available right now.');
                    return;
                }
                var peekedDemo = demoC.playVoted(true);
                if (!peekedDemo || !peekedDemo.player_info || !peekedDemo.demo_info || !peekedDemo.tier_info || !peekedDemo.record_info)
                {
                    Bot.say('It looks like the next demo might be broken and may be skipped...');
                }
                else 
                {
                    Bot.say(`@${chatter.username} next run: '${peekedDemo.player_info.name} on ${peekedDemo.demo_info.mapname} as ${peekedDemo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(peekedDemo.record_info.duration * 1000)})'!`);
                }
            }
            if (chatter.message === '!time')
            {
                //Do we need to log this?
                //log.printLn(`[TWITCH] ${chatter.username} used !nextrun, message: ${chatter.message}`, log.severity.DEBUG); 
                if (!app_running || !demo_playback)
                {
                    Bot.say('!time is not available right now.');
                    return;
                }
                // FIXME
                var current = Date.now() - runStartTime;
                if (current > demos[currentDemo].record_info.duration * 1000)
                    current = demos[currentDemo].record_info.duration * 1000;
                Bot.say(`@${chatter.username} run time: ${utils.msToTimeStamp(current)}/${utils.msToTimeStamp(demos[currentDemo].record_info.duration * 1000)}`);
            }
            if (chatter.message === '!map' || chatter.message === '!mi')
            {
                //Do we need to log this?
                //log.printLn(`[TWITCH] ${chatter.username} used !nextrun, message: ${chatter.message}`, log.severity.DEBUG); 
                if (!app_running)
                {
                    Bot.say('!map is not available right now.');
                    return;
                }
                if (demos[currentDemo] && demos[currentDemo].demo_info.mapname)
                {
                    tempus.mapOverview(demos[currentDemo].demo_info.mapname).then((mapInfo) =>
                    {
                        if (mapInfo && mapInfo.tiers && mapInfo.authors && mapInfo.name)
                        {
                            if (!mapInfo.authors.length)
                            {
                                Bot.say(`Map: ${mapInfo.name}  Author: N/A  Tier: Soldier: ${mapInfo.tiers.soldier} Demoman: ${mapInfo.tiers.demoman}  Download: https://tempus.xyz/maps/${mapInfo.name}`);
                            }
                            else if (mapInfo.authors.length == 1)
                            {
                                Bot.say(`Map: ${mapInfo.name}  Author: ${mapInfo.authors[0].name}  Tier: Soldier: ${mapInfo.tiers.soldier} Demoman: ${mapInfo.tiers.demoman}  Download: https://tempus.xyz/maps/${mapInfo.name}`);
                            }
                            else if (mapInfo.authors.length > 1)
                            {
                                var authStr = mapInfo.authors[0].name;
                                for (var i = 1; i < mapInfo.authors.length; i++)
                                {
                                    authStr += `, ${mapInfo.authors[i].name}`;
                                }
                                Bot.say(`Map: ${mapInfo.name}  Authors: ${authStr}  Tier: Soldier: ${mapInfo.tiers.soldier} Demoman: ${mapInfo.tiers.demoman}  Download: https://tempus.xyz/maps/${mapInfo.name}`);
                            }
                        }
                        else
                        {
                            Bot.say(`Could not find map info for current run!`);
                        }
                    });                    
                }
                else
                {
                    Bot.say(`Could not find map info for current run!`);
                }
                
            }
            if (chatter.message.startsWith('!rcon ') && (chatter.username === 'tempusrecords' || chatter.username === 'pancakelarry'))
            {
                log.printLn(`[TWITCH] ${chatter.username} used !rcon, message: ${chatter.message}`, log.severity.DEBUG);
                try
                {
                    rcon.instance().send(chatter.message.split('rcon ')[1]);
                }
                catch (err)
                {
                    log.printLn(err);
                }
            }
            if (chatter.message == '!restartTF2' && (chatter.username === 'tempusrecords' || chatter.mod === true))
            {
                log.printLn(`[TWITCH] ${chatter.username} used !restartTF2`, log.severity.DEBUG);
                try
                {
                    rcon.instance().send('exit');
                }
                catch (err)
                {
                    log.printLn(err);
                }
                startTF2;
            }
            if (chatter.message.startsWith('!nick ') && (chatter.username === 'tempusrecords' || chatter.mod === true))
            {
                log.printLn(`[TWITCH] ${chatter.username} used !nick, message: ${chatter.message}`, log.severity.DEBUG);
                var parts = chatter.message.split(' '),
                    steamid = '',
                    name = '';

                if (parts.length < 3)
                    return;

                // parts[0] = '!nick'
                // parts[1] = steamid
                // parts[2-n] = name
                steamid = parts[1];
                for (var i = 2; i < parts.length; i++)
                {
                    name += (i <= 2 ? parts[i] : ` ${parts[i]}`);
                }
                config.saveNick(steamid, name, chatter.username, (res, moderator) =>
                {
                    if (res)
                        Bot.say(`@${moderator} Nickname saved!`);
                    else
                        Bot.say(`@${moderator} Nickname could not be saved!`);
                });
            }
            if (chatter.message == '!reboot' && (chatter.username === 'tempusrecords' || chatter.username === 'pancakelarry'))
            {
                reboot();
            }
        });

        Bot.on('close', () =>
        {
            log.printLn('[TWITCH] Closed bot irc connection', log.severity.INFO)
            for (var i = 0; i < connections.length; i++)
                connections[i].connected = false;
            reconnect();
        });

        Bot.on('part', (channel) =>
        {
            log.printLn(`[TWITCH] parted from channel ${channel}`, log.severity.WARN)
            for (var i = 0; i < connections.length; i++)
                if (connections[i].name == channel)
                    connections[i].connected = false;
            reconnect();
        });

        Bot.on('error', (err) =>
        {
            log.printLn('[TWITCH] ERROR', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
        });

        for (var i = 0; i < connections.length; i++)
            Bot.join(connections[i].name);

        instance = function () { return Bot; };
        module.exports.instance = instance;
    }
});

function reconnect()
{
    log.printLn('[TWITCH] Attemping to reconnect to chat');
    if (Bot && connections)
    {
        for (var i = 0; i < connections.length; i++)
            if (!connections[i].connected)
                Bot.join(connections[i].name);
    }
    setTimeout(() =>
    {
        for (var i = 0; i < connections.length; i++)
        {
            if (!connections[i].connected)
            {
                reconnect();
                break;
            }
        }
    }, 10000);
}



module.exports.instance = instance;