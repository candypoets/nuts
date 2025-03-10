- make bulk update to indexed db when possible (EOSE), actually, always insert to indexed db at EOSE

- instead of dumping all indexed db on each EOSE, try sending the results via postMessage and let the handler
intelligently update the cache.

- divide the cache between profiles and events, and trigger a cacheUpdated store change for either
