import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const utf8Encoder = new TextEncoder();

/**
 * Validate event structure
 */
export function validateEvent(event) {
  if (typeof event !== 'object') return false;
  if (typeof event.kind !== 'number') return false;
  if (typeof event.content !== 'string') return false;
  if (typeof event.created_at !== 'number') return false;
  if (typeof event.pubkey !== 'string') return false;
  if (!event.pubkey.match(/^[a-f0-9]{64}$/)) return false;

  if (!Array.isArray(event.tags)) return false;
  for (let i = 0; i < event.tags.length; i++) {
    let tag = event.tags[i];
    if (!Array.isArray(tag)) return false;
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] !== 'string') return false;
    }
  }

  return true;
}

/**
 * Serialize event for hashing/signing
 */
export function serializeEvent(event) {
  if (!validateEvent(event)) {
    throw new Error("Can't serialize event with wrong or missing properties");
  }
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
}

/**
 * Calculate event ID (hash)
 */
export function getEventHash(event) {
  const serialized = serializeEvent(event);
  const hash = sha256(utf8Encoder.encode(serialized));
  return bytesToHex(hash);
}

/**
 * Sign an event with secret key
 */
export function finalizeEvent(eventTemplate, secretKey) {
  const pubkey = bytesToHex(schnorr.getPublicKey(secretKey));

  const event = {
    ...eventTemplate,
    pubkey,
  };

  event.id = getEventHash(event);
  event.sig = bytesToHex(schnorr.sign(event.id, secretKey));

  return event;
}

/**
 * Verify event signature
 */
export function verifyEvent(event) {
  const hash = getEventHash(event);
  if (hash !== event.id) return false;

  try {
    return schnorr.verify(event.sig, hash, event.pubkey);
  } catch (err) {
    return false;
  }
}

/**
 * Sign event using browser extension
 */
export async function signEventWithExtension(eventTemplate) {
  if (typeof window.nostr === 'undefined') {
    throw new Error('Nostr extension not found');
  }
  return await window.nostr.signEvent(eventTemplate);
}

/**
 * Create a kind 1 (text note) event template
 */
export function createTextNote(content, tags = []) {
  return {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: content,
  };
}

/**
 * Create a kind 0 (metadata) event template
 */
export function createProfileDataEvent(metadata) {
  return {
    kind: 0,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify(metadata),
  };
}

/**
 * Create a kind 3 (contact list / follows) event template
 */
export function createContactListEvent(follows) {
  const tags = follows.map(follow => {
    const tag = ['p', follow.pubkey];
    if (follow.relay) tag.push(follow.relay);
    if (follow.petname) tag.push(follow.petname);
    return tag;
  });

  return {
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: '',
  };
}

/**
 * Create a kind 10002 (relay list) event template
 */
export function createRelayListEvent(relays) {
  const tags = relays.map(relay => {
    const tag = ['r', relay.url];
    if (relay.read && !relay.write) tag.push('read');
    else if (relay.write && !relay.read) tag.push('write');
    return tag;
  });

  return {
    kind: 10002,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: '',
  };
}

/**
 * Parse relay list event (NIP-65)
 */
export function parseRelayList(event) {
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
 * Parse contact list event (NIP-02)
 */
export function parseContactList(event) {
  if (event.kind !== 3) return [];

  return event.tags
    .filter(tag => tag[0] === 'p' && tag[1])
    .map(tag => ({
      pubkey: tag[1],
      relay: tag[2] || '',
      petname: tag[3] || '',
    }));
}

/**
 * Sort events by created_at (newest first)
 */
export function sortEvents(events) {
  return events.sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return b.created_at - a.created_at;
    }
    return a.id.localeCompare(b.id);
  });
}
