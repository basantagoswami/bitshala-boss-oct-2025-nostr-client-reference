import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Generate a new random secret key (private key)
 */
export function generateSecretKey() {
  return schnorr.utils.randomPrivateKey();
}

/**
 * Derive public key from secret key
 */
export function getPublicKey(secretKey) {
  return bytesToHex(schnorr.getPublicKey(secretKey));
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Check if browser extension (NIP-07) is available
 */
export function hasNostrExtension() {
  return typeof window.nostr !== 'undefined';
}

/**
 * Get public key from browser extension
 */
export async function getPublicKeyFromExtension() {
  if (!hasNostrExtension()) {
    throw new Error('Nostr extension not found');
  }
  return await window.nostr.getPublicKey();
}

/**
 * Store secret key in local storage (for demo purposes)
 */
export function storeSecretKey(secretKeyHex) {
  localStorage.setItem('nostr_secret_key', secretKeyHex);
}

/**
 * Retrieve secret key from local storage
 */
export function getStoredSecretKey() {
  return localStorage.getItem('nostr_secret_key');
}

/**
 * Store login method
 */
export function storeLoginMethod(method) {
  localStorage.setItem('nostr_login_method', method);
}

/**
 * Get stored login method
 */
export function getLoginMethod() {
  return localStorage.getItem('nostr_login_method');
}

/**
 * Clear all stored auth data
 */
export function logout() {
  localStorage.removeItem('nostr_secret_key');
  localStorage.removeItem('nostr_login_method');
}

/**
 * Check if user is logged in
 */
export function isLoggedIn() {
  const method = getLoginMethod();
  if (method === 'extension') {
    return hasNostrExtension();
  }
  return !!getStoredSecretKey();
}

/**
 * Get current user's public key
 */
export async function getCurrentUserPubkey() {
  const method = getLoginMethod();

  if (method === 'extension') {
    try {
      return await getPublicKeyFromExtension();
    } catch (e) {
      console.error('Failed to get pubkey from extension:', e);
      return null;
    }
  }

  const secretKeyHex = getStoredSecretKey();
  if (secretKeyHex) {
    try {
      const secretKey = hexToBytes(secretKeyHex);
      return getPublicKey(secretKey);
    } catch (e) {
      console.error('Failed to derive pubkey from secret key:', e);
      return null;
    }
  }

  return null;
}
