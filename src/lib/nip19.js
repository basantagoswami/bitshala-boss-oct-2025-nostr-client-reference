// NIP-19: bech32-encoded entities (npub, nsec, note, etc.)

const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Encode(prefix, data) {
  const combined = convertBits(data, 8, 5, true);
  const checksum = createChecksum(prefix, combined);
  const encoded = combined.concat(checksum).map(i => BECH32_CHARSET[i]).join('');
  return prefix + '1' + encoded;
}

function bech32Decode(str) {
  const pos = str.lastIndexOf('1');
  if (pos < 1) throw new Error('Invalid bech32 string');

  const prefix = str.slice(0, pos);
  const data = str.slice(pos + 1);

  const decoded = [];
  for (let i = 0; i < data.length; i++) {
    const v = BECH32_CHARSET.indexOf(data[i]);
    if (v === -1) throw new Error('Invalid character');
    decoded.push(v);
  }

  const payload = decoded.slice(0, -6);
  const checksum = decoded.slice(-6);

  const expectedChecksum = createChecksum(prefix, payload);
  if (checksum.join('') !== expectedChecksum.join('')) {
    throw new Error('Invalid checksum');
  }

  return { prefix, data: convertBits(payload, 5, 8, false) };
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0;
  let bits = 0;
  const result = [];
  const maxv = (1 << toBits) - 1;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (value < 0 || value >> fromBits !== 0) {
      throw new Error('Invalid data');
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    throw new Error('Invalid padding');
  }

  return result;
}

function createChecksum(prefix, data) {
  const values = prefixExpand(prefix).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const polymod = bech32Polymod(values) ^ 1;
  const checksum = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((polymod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

function prefixExpand(prefix) {
  const result = [];
  for (let i = 0; i < prefix.length; i++) {
    result.push(prefix.charCodeAt(i) >> 5);
  }
  result.push(0);
  for (let i = 0; i < prefix.length; i++) {
    result.push(prefix.charCodeAt(i) & 31);
  }
  return result;
}

function bech32Polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (let i = 0; i < values.length; i++) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[i];
    for (let j = 0; j < 5; j++) {
      if ((b >> j) & 1) {
        chk ^= GEN[j];
      }
    }
  }
  return chk;
}

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Encode public key to npub
 */
export function npubEncode(pubkeyHex) {
  const bytes = hexToBytes(pubkeyHex);
  return bech32Encode('npub', bytes);
}

/**
 * Decode npub to public key hex
 */
export function npubDecode(npub) {
  const { prefix, data } = bech32Decode(npub);
  if (prefix !== 'npub') throw new Error('Invalid npub');
  return bytesToHex(data);
}

/**
 * Encode private key to nsec
 */
export function nsecEncode(privkeyHex) {
  const bytes = hexToBytes(privkeyHex);
  return bech32Encode('nsec', bytes);
}

/**
 * Decode nsec to private key hex
 */
export function nsecDecode(nsec) {
  const { prefix, data } = bech32Decode(nsec);
  if (prefix !== 'nsec') throw new Error('Invalid nsec');
  return bytesToHex(data);
}

/**
 * Encode event ID to note
 */
export function noteEncode(eventIdHex) {
  const bytes = hexToBytes(eventIdHex);
  return bech32Encode('note', bytes);
}

/**
 * Decode note to event ID hex
 */
export function noteDecode(note) {
  const { prefix, data } = bech32Decode(note);
  if (prefix !== 'note') throw new Error('Invalid note');
  return bytesToHex(data);
}
