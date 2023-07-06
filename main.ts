import { join } from 'path';
import { parse } from 'flags';
import { type Activity, Client } from 'discord_rpc';
import { PathOfExileLog } from 'poe-log-events';

const steamDir = () => {
    switch (Deno.build.os) {
        case 'windows':
            return join(Deno.env.get('PROGRAMFILES(X86)')!, 'Steam');
        case 'darwin':
            return join(
                Deno.env.get('HOME')!,
                'Library',
                'Application Support',
                'Steam',
            );
        case 'linux':
            return join(Deno.env.get('HOME')!, '.steam', 'steam');
        default:
            throw Error('Unsupported operating system');
    }
};

const args = parse(Deno.args, {
    alias: {
        'log-file': ['l'],
        'client-id': ['i'],
        'text': ['t'],
    },
    string: ['log-file', 'client-id', 'text'],
    default: {
        'log-file': join(
            steamDir(),
            'steamapps',
            'common',
            'Path of Exile',
            'logs',
            'Client.txt',
        ),
        'client-id': '1126475686035587102',
        'text': 'v3.21',
    },
});

let connected = false;

const client = new Client({ id: args.i });

const activity: Activity = {
    timestamps: {
        start: new Date().getTime(),
    },
    assets: {
        large_image: 'logo',
        large_text: args.t
    }
};

const log = new PathOfExileLog({
    logFilePath: args.l,
    ignoreDebug: true,
});

console.log('Waiting...');

log.addListener('login', (_) => {
    if (!connected) {
        client.connect()
            .then((c) => {
                console.log('Connected.');
                c.setActivity(activity);
                connected = true;
            })
            .catch(console.error);
    } else {
        delete activity.details;
        client.setActivity(activity);
    }
});

log.addListener('areaEntered', (evt) => {
    activity.details = evt.newArea;
    client.setActivity(activity);
});

log.addListener('afk', (evt) => {
    activity.state = evt.autoreply || 'AFK mode is ON.';
    client.setActivity(activity);
});

log.addListener('dnd', (evt) => {
    activity.state = evt.autoreply || 'DND mode is ON.';
    client.setActivity(activity);
});

log.addListener('afkEnd', (_) => {
    delete activity.state;
    client.setActivity(activity);
});

log.addListener('dndEnd', (_) => {
    delete activity.state;
    client.setActivity(activity);
});

Deno.addSignalListener('SIGINT', () => {
    console.log('\rQuitting.');
    try {
        log.removeAllListeners();
        if (connected) client.close();
    } catch (err) {
        console.error(err);
    } finally {
        Deno.exit();
    }
});
