/**
 * Normalize relay URL
 */
export function normalizeURL(url) {
  try {
    if (url.indexOf('://') === -1) url = 'wss://' + url;
    let p = new URL(url);
    p.pathname = p.pathname.replace(/\/+/g, '/');
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1);
    if ((p.port === '80' && p.protocol === 'ws:') || (p.port === '443' && p.protocol === 'wss:'))
      p.port = '';
    p.searchParams.sort();
    p.hash = '';
    return p.toString();
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Generate a random subscription ID
 */
export function generateSubId() {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * Relay connection class
 */
export class Relay {
  constructor(url) {
    this.url = normalizeURL(url);
    this.ws = null;
    this.subscriptions = new Map();
    this.status = 'disconnected'; // disconnected, connecting, connected, error
    this.eventCallbacks = new Map();
    this.eoseCallbacks = new Map();
  }

  /**
   * Connect to the relay
   */
  connect() {
    if (this.status === 'connected') return Promise.resolve();
    if (this.status === 'connecting') return this._connectionPromise;

    this.status = 'connecting';

    this._connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.status = 'connected';
          console.log(`Connected to relay: ${this.url}`);
          resolve();
        };

        this.ws.onclose = () => {
          this.status = 'disconnected';
          console.log(`Disconnected from relay: ${this.url}`);
        };

        this.ws.onerror = (error) => {
          this.status = 'error';
          console.error(`Relay error (${this.url}):`, error);
          reject(error);
        };

        this.ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            this._handleMessage(data);
          } catch (e) {
            console.error('Failed to parse relay message:', e);
          }
        };
      } catch (error) {
        this.status = 'error';
        reject(error);
      }
    });

    return this._connectionPromise;
  }

  /**
   * Handle incoming relay messages
   */
  _handleMessage(data) {
    const [type, ...rest] = data;

    switch (type) {
      case 'EVENT': {
        const [subId, event] = rest;
        const callback = this.eventCallbacks.get(subId);
        if (callback) callback(event);
        break;
      }

      case 'EOSE': {
        const [subId] = rest;
        const callback = this.eoseCallbacks.get(subId);
        if (callback) callback();
        break;
      }

      case 'OK': {
        const [eventId, accepted, message] = rest;
        console.log(`Event ${eventId} ${accepted ? 'accepted' : 'rejected'}: ${message}`);
        break;
      }

      case 'NOTICE': {
        const [message] = rest;
        console.log(`Notice from ${this.url}: ${message}`);
        break;
      }

      default:
        console.log(`Unknown message type from ${this.url}:`, type);
    }
  }

  /**
   * Subscribe to events matching filters
   */
  subscribe(filters, onEvent, onEose) {
    const subId = generateSubId();

    this.eventCallbacks.set(subId, onEvent);
    if (onEose) this.eoseCallbacks.set(subId, onEose);

    const message = JSON.stringify(['REQ', subId, ...filters]);

    if (this.status === 'connected') {
      this.ws.send(message);
    } else {
      this.connect().then(() => {
        this.ws.send(message);
      });
    }

    this.subscriptions.set(subId, { filters, onEvent, onEose });

    return subId;
  }

  /**
   * Unsubscribe from a subscription
   */
  unsubscribe(subId) {
    if (this.status === 'connected') {
      const message = JSON.stringify(['CLOSE', subId]);
      this.ws.send(message);
    }

    this.subscriptions.delete(subId);
    this.eventCallbacks.delete(subId);
    this.eoseCallbacks.delete(subId);
  }

  /**
   * Publish an event to the relay
   */
  async publish(event) {
    await this.connect();
    const message = JSON.stringify(['EVENT', event]);
    this.ws.send(message);
  }

  /**
   * Close the relay connection
   */
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.status = 'disconnected';
    this.subscriptions.clear();
    this.eventCallbacks.clear();
    this.eoseCallbacks.clear();
  }
}

/**
 * Relay pool for managing multiple relay connections
 */
export class RelayPool {
  constructor() {
    this.relays = new Map();
  }

  /**
   * Add a relay to the pool
   */
  addRelay(url) {
    const normalizedUrl = normalizeURL(url);
    if (this.relays.has(normalizedUrl)) {
      return this.relays.get(normalizedUrl);
    }

    const relay = new Relay(normalizedUrl);
    this.relays.set(normalizedUrl, relay);
    return relay;
  }

  /**
   * Remove a relay from the pool
   */
  removeRelay(url) {
    const normalizedUrl = normalizeURL(url);
    const relay = this.relays.get(normalizedUrl);
    if (relay) {
      relay.close();
      this.relays.delete(normalizedUrl);
    }
  }

  /**
   * Subscribe to events from all relays in the pool
   */
  subscribe(filters, onEvent, onEose) {
    const subs = [];

    for (const relay of this.relays.values()) {
      const subId = relay.subscribe(filters, onEvent, onEose);
      subs.push({ relay: relay.url, subId });
    }

    return subs;
  }

  /**
   * Publish an event to all relays in the pool
   */
  async publish(event) {
    const promises = [];

    for (const relay of this.relays.values()) {
      promises.push(
        relay.publish(event).catch(err => {
          console.error(`Failed to publish to ${relay.url}:`, err);
          return { relay: relay.url, error: err };
        })
      );
    }

    return Promise.all(promises);
  }

  /**
   * Close all relay connections
   */
  closeAll() {
    for (const relay of this.relays.values()) {
      relay.close();
    }
    this.relays.clear();
  }
}
