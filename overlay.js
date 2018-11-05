var app = require('./app.js'),
    log = require('./log.js');

function update(time_enabled = false, time_loading = false, time_time = '', info_enabled = false, info_name = '', info_map = '', info_tier = 0)
{
    app.io.of('/').clients(function (error, clients)
    {
        if (error)
        {
            log.printLn('[SOCKET] Error getting clients', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            return;
        }
        clients.forEach(function (i)
        {
            app.io.of('/').sockets[i].emit('setTimer', { enabled: time_enabled, loading: time_loading, time: time_time });
            app.io.of('/').sockets[i].emit('setInfo', { enabled: info_enabled, name: info_name, map: info_map, tier: `Tier ${info_tier}` });
        });
    });
}

function drawError(error_string)
{
    app.io.of('/').clients(function (error, clients)
    {
        if (error)
        {
            log.printLn('[SOCKET] Error getting clients', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            return;
        }
        clients.forEach(function (i)
        {
            app.io.of('/').sockets[i].emit('setError', { error_string: error_string });
        });
    });
}

function drawLoadingStatus(status = null)
{
    app.io.of('/').clients(function (error, clients)
    {
        if (error)
        {
            log.printLn('[SOCKET] Error getting clients', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            return;
        }
        clients.forEach(function (i)
        {
            app.io.of('/').sockets[i].emit('setLoadingStatus', { status: status });
        });
    });
}

function drawVotes()
{
    var votes_obj = [], obj = {};
    var next = true;
    var votes = runVotes;
    votes.sort((a, b) =>
    {
        if (a.users.length > b.users.length)
            return -1;
        else if (a.users.length < b.users.length)
            return 1;
        return 0;
    });
    for (var i = 0; i < votes.length; i++)
    {
        // has votes
        if (votes[i].users.length != 0)
        {
            for (var e = 0; e < demos.length; e++)
            {
                if (votes[i].demo_name == demos[e].demo_info.filename)
                {
                    votes_obj.push({ vote_count: votes[i].users.length, map_name: demos[e].demo_info.mapname, player_name: demos[e].player_info.name, class_name: demos[e].record_info.class == 4 ? 'demo' : 'solly' });
                    next = false;
                } 
            }
        }
    }

    if (next)
    {
        if (currentDemo + 1 < demos.length)
            obj.next = { player_name: demos[currentDemo + 1].player_info.name, map_name: demos[currentDemo + 1].demo_info.mapname, class_name: demos[currentDemo + 1].record_info.class == 4 ? 'demo' : 'solly' };
        else
            obj.next = { player_name: demos[0].player_info.name, map_name: demos[0].demo_info.mapname, class_name: demos[0].record_info.class == 4 ? 'demo' : 'solly' };
    }
    else
        obj.votes = votes_obj;

    log.printLn('next: ' + next, log.severity.DEBUG);
    log.printLn('obj: ' + JSON.stringify(obj), log.severity.DEBUG);
    app.io.of('/').clients(function (error, clients)
    {
        if (error)
        {
            log.printLn('[SOCKET] Error getting clients', log.severity.ERROR);
            log.printLnNoStamp(JSON.stringify(err), log.severity.DEBUG);
            return;
        }
        clients.forEach(function (i)
        {
            app.io.of('/').sockets[i].emit('setVotes', obj);
        });
    });
}

module.exports.drawError = drawError;
module.exports.drawLoadingStatus = drawLoadingStatus;
module.exports.update = update;
module.exports.drawVotes = drawVotes;