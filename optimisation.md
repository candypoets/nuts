- make bulk update to indexed db when possible (EOSE), actually, always insert to indexed db at EOSE

- instead of dumping all indexed db on each EOSE, try sending the results via postMessage and let the handler
intelligently update the cache.

- divide the cache between profiles and events, and trigger a cacheUpdated store change for either


nevent:c91e318b0e0ed31e27e21a28e8043c64abdddf9038c8a99cb8598a3a9708b906
