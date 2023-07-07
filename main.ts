import { join } from 'path';
import { type Activity, Client } from 'discord_rpc';
import { Input, Secret } from 'prompt';
import { PathOfExileLog } from 'poe-log-events';

type Character = {
    name: string;
    league: string;
    classId: number;
    ascendancyClass: number;
    class: string;
    level: number;
    experience: number;
    pinnable: boolean;
    lastActive?: boolean;
};

const steamDir = () => {
    switch (Deno.build.os) {
        case 'windows':
            return join(Deno.env.get('PROGRAMFILES(X86)')!, 'Steam');
        case 'darwin':
            return join(Deno.env.get('HOME')!, 'Library', 'Application Support', 'Steam');
        case 'linux':
            return join(Deno.env.get('HOME')!, '.steam', 'steam');
        default:
            throw Error('Unsupported operating system');
    }
};

const logFile = Deno.args.at(0) ||
    join(steamDir(), 'steamapps', 'common', 'Path of Exile', 'logs', 'Client.txt');
try {
    const stat = await Deno.stat(logFile);
    if (!stat.isFile) {
        throw Error(`Error: '${logFile}' is not a file`);
    }
} catch (error) {
    console.error(error.message);
    Deno.exit(1);
}

const userAgent = 'poe-discord-rpc/0.2.1 (contact: github.com/ObserverOfTime)';
const apiUrl = 'https://www.pathofexile.com/character-window/get-characters';

let connected = false;
let character: Character | undefined;

const client = new Client({ id: '1126475686035587102' });

const activity: Activity = {
    timestamps: {
        start: new Date().getTime(),
    },
    assets: {
        large_image: 'logo',
    },
};

const log = new PathOfExileLog({
    logFilePath: logFile,
    ignoreDebug: true,
});

const hashRegex = /^[0-9A-Fa-f]{32}$/;
const poesessid = await Secret.prompt({
    message: 'Input your POESESSID',
    validate: (value) => hashRegex.test(value),
    prefix: '',
});

console.log('Waiting...');

log.addListener('login', async (_) => {
    if (!connected) {
        try {
            await client.connect();
            const res = await fetch(apiUrl, {
                headers: {
                    'User-Agent': userAgent,
                    'Cookie': 'POESESSID=' + poesessid,
                },
            });
            if (res.ok) {
                const data: Character[] = await res.json();
                const names = data.map((c) => c.name);
                const name = await Input.prompt({
                    message: 'Choose your character',
                    validate: (value) => names.includes(value),
                    suggestions: names,
                    list: true,
                    prefix: '',
                });
                character = data.find((c) => c.name == name);
                if (character) {
                    activity.assets!.large_text = `Character: ${character.name}`;
                    activity.assets!.small_image = character.class.toLowerCase();
                    activity.assets!.small_text = `Level ${character.level} ${character.class}`;
                }
            } else {
                console.error(res.statusText);
            }
            client.setActivity(activity);
            console.log('Connected.');
            connected = true;
        } catch (err) {
            console.error(err);
        }
    } else {
        delete activity.details;
        client.setActivity(activity);
    }
});

log.addListener('areaEntered', (evt) => {
    activity.details = `Area: ${evt.newArea}`;
    client.setActivity(activity);
});

log.addListener('level', (evt) => {
    if (character?.name != evt.character) return;
    activity.assets!.small_text = activity.assets!.small_text
        ?.replace(/\d+/, evt.characterLevel.toString());
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
