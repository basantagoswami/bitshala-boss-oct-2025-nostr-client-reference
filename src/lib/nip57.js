// NIP-57: Lightning Zaps utilities

/**
 * Get zap endpoint from user metadata
 */
export async function getZapEndpoint(metadataEvent) {
  try {
    const metadata = JSON.parse(metadataEvent.content);
    let lnurl = '';

    // Check for lud16 (Lightning Address)
    if (metadata.lud16) {
      const [name, domain] = metadata.lud16.split('@');
      lnurl = `https://${domain}/.well-known/lnurlp/${name}`;
    } else if (metadata.lud06) {
      // lud06 is a bech32 encoded LNURL (more complex, skip for simplicity)
      console.log('lud06 not implemented in this demo');
      return null;
    } else {
      return null;
    }

    // Fetch the LNURL endpoint
    const res = await fetch(lnurl);
    const body = await res.json();

    // Check if it supports Nostr zaps
    if (body.allowsNostr && body.nostrPubkey) {
      return body.callback;
    }

    return null;
  } catch (err) {
    console.error('Failed to get zap endpoint:', err);
    return null;
  }
}

/**
 * Create a zap request event (kind 9734)
 */
export function createZapRequest({ recipientPubkey, amount, comment = '', relays = [], eventId = null }) {
  const tags = [
    ['p', recipientPubkey],
    ['amount', amount.toString()],
    ['relays', ...relays],
  ];

  // If zapping an event, add 'e' tag
  if (eventId) {
    tags.push(['e', eventId]);
  }

  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags: tags,
    content: comment,
  };
}

/**
 * Parse zap receipt (kind 9735) to extract zap information
 */
export function parseZapReceipt(zapReceipt) {
  if (zapReceipt.kind !== 9735) return null;

  try {
    // Extract bolt11 invoice
    const bolt11Tag = zapReceipt.tags.find(tag => tag[0] === 'bolt11');
    if (!bolt11Tag) return null;

    // Extract description (the zap request)
    const descTag = zapReceipt.tags.find(tag => tag[0] === 'description');
    if (!descTag) return null;

    const zapRequest = JSON.parse(descTag[1]);

    // Extract amount from zap request
    const amountTag = zapRequest.tags.find(tag => tag[0] === 'amount');
    const amount = amountTag ? parseInt(amountTag[1]) : 0;

    // Extract sender pubkey from zap request
    const senderPubkey = zapRequest.pubkey;

    // Extract recipient pubkey
    const recipientTag = zapRequest.tags.find(tag => tag[0] === 'p');
    const recipientPubkey = recipientTag ? recipientTag[1] : null;

    // Extract zapped event ID if present
    const eventTag = zapRequest.tags.find(tag => tag[0] === 'e');
    const eventId = eventTag ? eventTag[1] : null;

    return {
      amount,
      senderPubkey,
      recipientPubkey,
      eventId,
      comment: zapRequest.content || '',
      bolt11: bolt11Tag[1],
    };
  } catch (err) {
    console.error('Failed to parse zap receipt:', err);
    return null;
  }
}

/**
 * Calculate total zaps received on an event
 */
export function calculateTotalZaps(zapReceipts, eventId = null) {
  let total = 0;

  for (const receipt of zapReceipts) {
    const zap = parseZapReceipt(receipt);
    if (zap && (!eventId || zap.eventId === eventId)) {
      total += Math.floor(zap.amount / 1000); // Convert millisats to sats
    }
  }

  return total;
}

/**
 * Get satoshi amount from bolt11 invoice
 */
export function getSatoshisFromBolt11(bolt11) {
  if (bolt11.length < 50) return 0;

  bolt11 = bolt11.substring(0, 50);
  const idx = bolt11.lastIndexOf('1');
  if (idx === -1) return 0;

  const hrp = bolt11.substring(0, idx);
  if (!hrp.startsWith('lnbc')) return 0;

  const amount = hrp.substring(4);
  if (amount.length < 1) return 0;

  const lastChar = amount[amount.length - 1];
  const isDigit = /\d/.test(lastChar);

  let cutPoint = amount.length - 1;
  if (isDigit) cutPoint++;

  if (cutPoint < 1) return 0;

  const num = parseInt(amount.substring(0, cutPoint));

  switch (lastChar) {
    case 'm':
      return num * 100000;
    case 'u':
      return num * 100;
    case 'n':
      return Math.floor(num / 10);
    case 'p':
      return Math.floor(num / 10000);
    default:
      return num * 100000000;
  }
}

/**
 * Format sats amount for display
 */
export function formatSats(sats) {
  if (sats >= 100000000) {
    return `${(sats / 100000000).toFixed(2)} BTC`;
  } else if (sats >= 1000) {
    return `${(sats / 1000).toFixed(1)}K sats`;
  } else {
    return `${sats} sats`;
  }
}
