import type { NPool } from '@nostrify/nostrify';
import type { Contact } from 'src/model/contact';

self.onmessage = async function (
	pool: NPool,
	contacts: Contact[],
	abortController: AbortController,
	filter: Object
) {
  
}
