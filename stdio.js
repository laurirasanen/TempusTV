var demo = require('./demo.js'),
    app = require('./app.js'),
    rcon = require('./rcon.js'),
    log = require('./log.js'),
    readline = require('readline'),
    utils = require('./utils.js');

// TODO:
// Are console commands required?
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (input) =>
{
    if (input === 'skip')
    {
        if (!app_running)
        {
            log.printLnNoStamp('App not running!', log.severity.ERROR);
            return;
        }
        // FIXME:
        // cannot read property skip of undefined
        demo.skip();
    }
    else if (input.startsWith('rcon '))
    {
        try
        {
            rcon.instance().send(input.split('rcon ')[1]);
        }
        catch (err)
        {
            log.printLn(err);
        }
    }
    else if (input === 'load')
        app.load();
    else if (input === 'start')
        app.start();
    else if (input === 'stop')
        app.stop();
    else if (input === 'shuffle')
    {
        log.printLnNoStamp('Shuffling demos', log.severity.WARN);
        demo.shuffle();
    }
    else if (input.startsWith('setnextrun '))
    {
        // FIXME:
        // Votes are priorised over this since this only moves the index
        // demo.js playVoted is going to screw this
        var map_string = input.split(' ')[1];
        var class_string = input.split(' ')[2];

        if (!map_string || map_string.length < 0)
        {
            return;
        }
        if (!class_string || class_string.length < 0)
        {
            return;
        }
        if (class_string.includes('solly'))
            class_string = 'soldier';
        if (class_string.includes('demo'))
            class_string = 'demoman';
        var class_number = class_string == 'demoman' ? 4 : 3;
        var map_name = '', demo = null;
        for (var i = 0; i < demos.length; i++)
        {
            if (demos[i].demo_info.mapname.includes(map_string))
            {
                if (demos[i].record_info.class == class_number)
                {
                    demo = demos[i];
                    map_name = demos[i].demo_info.mapname;
                }
            }
            if (demos[i].demo_info.mapname === map_string)
            {
                if (demos[i].record_info.class == class_number)
                {
                    demo = demos[i];
                    map_name = demos[i].demo_info.mapname;
                    break;
                }
            }
        }

        if (demo != null)
        {
            if (currentDemo + 1 < demos.length)
            {
                var d = demos[currentDemo + 1];
                demos[currentDemo + 1] = demo;
                demos[i] = d;
            }
            else
            {
                var d = demos[0];
                demos[0] = demo;
                demos[i] = d;
            }
            log.printLnNoStamp(`Set next map '${demo.player_info.name} on ${demo.demo_info.mapname} as ${demo.record_info.class == 4 ? 'demoman' : 'soldier'} (${utils.msToTimeStamp(demo.record_info.duration * 1000)})'!`, log.severity.INFO);
        }
        else
        {
            log.printLnNoStamp(`Couldn't find a run for '${map_string} ${class_string}'`, log.severity.INFO);
        }
    }
    else
    {
        log.printLnNoStamp(`Unknown command '${input}'.`, log.severity.INFO);
    }
});