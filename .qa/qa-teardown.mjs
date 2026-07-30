// Tear down QA communities provisioned by qa-bootstrap.mjs.
//
//   node .qa/qa-teardown.mjs           # delete the relay in the state file + its volume
//   node .qa/qa-teardown.mjs --sweep   # delete ALL qa-* relays + orphan strfry volumes
//
// The coordinator's DELETE removes the container and DB record but NOT the named
// docker volume (strfry-badge-data-<id>) — removed here explicitly.
// --sweep is the crash-recovery janitor: use it after a run died mid-workflow.
import { execFileSync } from 'child_process';
import {
	clearCommunity,
	deleteRelay,
	listRelays,
	loadKeys,
	readCommunity,
	requireCoordinator
} from './qa-lib.mjs';

const sweep = process.argv.includes('--sweep');
const keys = loadKeys();

function removeVolume(id) {
	try {
		execFileSync('docker', ['volume', 'rm', '-f', `strfry-badge-data-${id}`], { stdio: 'pipe' });
		console.log('ok - removed volume strfry-badge-data-' + id);
	} catch {
		console.log('warn - volume strfry-badge-data-' + id + ' not removed (already gone?)');
	}
}

async function removeRelay(id, label) {
	try {
		await deleteRelay(id, keys);
		console.log('ok - deleted relay', id, label ? `(${label})` : '');
	} catch (error) {
		console.log('warn - relay delete failed for', id, '-', error.message.split('\n')[0]);
	}
	removeVolume(id);
}

await requireCoordinator();

if (sweep) {
	const relays = await listRelays(keys);
	const qaRelays = relays.filter((relay) => (relay.domain || '').startsWith('qa-'));
	if (!qaRelays.length) console.log('ok - no qa-* relays to delete');
	for (const relay of qaRelays) {
		await removeRelay(relay.id, relay.name || relay.domain);
	}

	// Orphan volumes: relay id no longer present in the coordinator DB.
	const liveIds = new Set((await listRelays(keys)).map((relay) => relay.id));
	let volumes = [];
	try {
		volumes = execFileSync('docker', ['volume', 'ls', '--format', '{{.Name}}'])
			.toString()
			.split('\n')
			.filter((name) => name.startsWith('strfry-badge-data-'));
	} catch {
		console.log('warn - could not list docker volumes');
	}
	for (const volume of volumes) {
		const id = volume.replace('strfry-badge-data-', '');
		if (!liveIds.has(id)) {
			try {
				execFileSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'pipe' });
				console.log('ok - removed orphan volume', volume);
			} catch {
				console.log('warn - could not remove volume', volume);
			}
		}
	}
	console.log('SWEEP PASS');
	process.exit(0);
}

const community = readCommunity();
if (!community?.id) {
	console.error(`no QA community state at ${process.env.QA_STATE || '/tmp/qa-community.json'}`);
	console.error('run qa-bootstrap.mjs first, or use --sweep to clean up by name');
	process.exit(1);
}

await removeRelay(community.id, community.name);
clearCommunity();
console.log('TEARDOWN PASS');
process.exit(0);
