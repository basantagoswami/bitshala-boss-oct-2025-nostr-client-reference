// NIP-65: Relay List Metadata utilities

import { Relay } from './relay.js';

const PURPLEPAGES_RELAY = 'wss://purplepag.es';

/**
 * Fetch user's relay list from purplepag.es
 */
export async function fetchUserRelays(pubkey) {
  return new Promise((resolve, reject) => {
    const relay = new Relay(PURPLEPAGES_RELAY);
    const events = [];

    relay.connect()
      .then(() => {
        relay.subscribe(
          [
            {
              kinds: [10002],
              authors: [pubkey],
              limit: 1,
            }
          ],
          (event) => {
            events.push(event);
          },
          () => {
            // EOSE - end of stored events
            relay.close();

            if (events.length > 0) {
              // Get the most recent relay list
              events.sort((a, b) => b.created_at - a.created_at);
              const relays = parseRelayListEvent(events[0]);
              resolve(relays);
            } else {
              // No relay list found, return default relays
              resolve(getDefaultRelays());
            }
          }
        );

        // Timeout after 5 seconds
        setTimeout(() => {
          relay.close();
          if (events.length > 0) {
            events.sort((a, b) => b.created_at - a.created_at);
            const relays = parseRelayListEvent(events[0]);
            resolve(relays);
          } else {
            resolve(getDefaultRelays());
          }
        }, 5000);
      })
      .catch((err) => {
        console.error('Failed to connect to purplepag.es:', err);
        reject(err);
      });
  });
}

/**
 * Parse a kind 10002 relay list event
 */
export function parseRelayListEvent(event) {
  if (event.kind !== 10002) return [];

  return event.tags
    .filter(tag => tag[0] === 'r' && tag[1])
    .map(tag => ({
      url: tag[1],
      read: !tag[2] || tag[2] === 'read',
      write: !tag[2] || tag[2] === 'write',
    }));
}

/**
 * Get default relays to use when user has no relay list
 */
export function getDefaultRelays() {
  return [
    { url: 'wss://relay.damus.io', read: true, write: true },
    { url: 'wss://nos.lol', read: true, write: true },
    { url: 'wss://relay.primal.net', read: true, write: true },
    { url: 'wss://relay.nostr.band', read: true, write: true },
  ];
}

/**
 * Get read relays from a relay list
 */
export function getReadRelays(relays) {
  return relays.filter(r => r.read).map(r => r.url);
}

/**
 * Get write relays from a relay list
 */
export function getWriteRelays(relays) {
  return relays.filter(r => r.write).map(r => r.url);
}

/**
 * Store relay list in localStorage
 */
export function storeUserRelays(pubkey, relays) {
  const key = `nostr_relays_${pubkey}`;
  localStorage.setItem(key, JSON.stringify(relays));
}

/**
 * Load relay list from localStorage
 */
export function loadUserRelays(pubkey) {
  const key = `nostr_relays_${pubkey}`;
  const stored = localStorage.getItem(key);

  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse stored relays:', e);
      return null;
    }
  }

  return null;
}

/**
 * Fetch and cache user relays
 */
export async function getUserRelays(pubkey, forceRefresh = false) {
  // Try to load from cache first
  if (!forceRefresh) {
    const cached = loadUserRelays(pubkey);
    if (cached) {
      return cached;
    }
  }

  // Fetch from network
  try {
    const relays = await fetchUserRelays(pubkey);
    storeUserRelays(pubkey, relays);
    return relays;
  } catch (err) {
    console.error('Failed to fetch user relays:', err);

    // Try cache as fallback
    const cached = loadUserRelays(pubkey);
    if (cached) return cached;

    // Return defaults as last resort
    return getDefaultRelays();
  }
}
