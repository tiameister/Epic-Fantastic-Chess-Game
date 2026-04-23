export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    this.listeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    const set = this.listeners.get(eventName);
    if (!set) {
      return;
    }
    set.delete(callback);
    if (set.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName, payload) {
    const set = this.listeners.get(eventName);
    if (!set) {
      return;
    }
    set.forEach((callback) => callback(payload));
  }
}
