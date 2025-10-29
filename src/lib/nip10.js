// NIP-10: Reply/Thread handling utilities

/**
 * Parse NIP-10 tags from an event to understand thread structure
 */
export function parseThread(event) {
  const result = {
    root: null,        // Root event of the thread
    reply: null,       // Direct parent event
    mentions: [],      // Other events mentioned
    profiles: [],      // Profiles mentioned
  };

  let maybeRoot = null;
  let maybeReply = null;

  // Process tags in reverse order
  for (let i = event.tags.length - 1; i >= 0; i--) {
    const tag = event.tags[i];

    // Handle 'e' tags (event references)
    if (tag[0] === 'e' && tag[1]) {
      const eventRef = {
        id: tag[1],
        relay: tag[2] || '',
        marker: tag[3] || '',
      };

      // Check for markers
      if (eventRef.marker === 'root') {
        result.root = eventRef;
        continue;
      }

      if (eventRef.marker === 'reply') {
        result.reply = eventRef;
        continue;
      }

      if (eventRef.marker === 'mention') {
        result.mentions.push(eventRef);
        continue;
      }

      // Legacy positional markers (no explicit marker)
      if (!maybeReply) {
        maybeReply = eventRef;
      } else if (!maybeRoot) {
        maybeRoot = eventRef;
      }

      result.mentions.push(eventRef);
    }

    // Handle 'p' tags (profile mentions)
    if (tag[0] === 'p' && tag[1]) {
      result.profiles.push({
        pubkey: tag[1],
        relay: tag[2] || '',
      });
    }
  }

  // Fill in root and reply from legacy markers if not explicitly set
  if (!result.root) {
    result.root = maybeRoot || maybeReply || result.reply;
  }
  if (!result.reply) {
    result.reply = maybeReply || result.root;
  }

  return result;
}

/**
 * Create reply tags for replying to an event
 */
export function createReplyTags(event, rootEventId = null, relay = '') {
  const tags = [];

  // Add 'p' tag for the author of the event we're replying to
  tags.push(['p', event.pubkey, relay]);

  // If this is a top-level reply (no root), this event becomes the root
  if (!rootEventId) {
    tags.push(['e', event.id, relay, 'root']);
    tags.push(['e', event.id, relay, 'reply']);
  } else {
    // If replying in an existing thread
    tags.push(['e', rootEventId, relay, 'root']);
    tags.push(['e', event.id, relay, 'reply']);
  }

  return tags;
}

/**
 * Extract all mentioned pubkeys from an event's tags
 */
export function getMentionedPubkeys(event) {
  return event.tags
    .filter(tag => tag[0] === 'p' && tag[1])
    .map(tag => tag[1]);
}

/**
 * Extract all mentioned event IDs from an event's tags
 */
export function getMentionedEvents(event) {
  return event.tags
    .filter(tag => tag[0] === 'e' && tag[1])
    .map(tag => tag[1]);
}

/**
 * Check if an event is a reply
 */
export function isReply(event) {
  const thread = parseThread(event);
  return thread.reply !== null;
}

/**
 * Get root event ID if this is part of a thread
 */
export function getRootEventId(event) {
  const thread = parseThread(event);
  return thread.root ? thread.root.id : null;
}

/**
 * Get reply-to event ID
 */
export function getReplyToEventId(event) {
  const thread = parseThread(event);
  return thread.reply ? thread.reply.id : null;
}

/**
 * Build a thread tree from a flat list of events
 */
export function buildThreadTree(events) {
  const eventMap = new Map();
  const roots = [];

  // First pass: create map of all events
  for (const event of events) {
    eventMap.set(event.id, {
      event,
      children: [],
    });
  }

  // Second pass: build parent-child relationships
  for (const event of events) {
    const replyToId = getReplyToEventId(event);

    if (!replyToId || !eventMap.has(replyToId)) {
      // This is a root event
      roots.push(eventMap.get(event.id));
    } else {
      // This is a reply, add as child
      const parent = eventMap.get(replyToId);
      parent.children.push(eventMap.get(event.id));
    }
  }

  return { roots, eventMap };
}
