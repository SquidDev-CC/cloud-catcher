import { PacketCode } from "../network";

export class BufferingEventQueue<T> {
  private readonly queue: T[] = [];
  private readonly listeners: Array<(event: T) => void> = [];

  public attach(listener: (event: T) => void) {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) return;

    this.listeners.push(listener);

    if (this.queue.length > 0) {
      // Fire any buffered events
      for (const event of this.queue) listener(event);
      this.queue.length = 0;
    }
  }

  public detach(listener: (event: T) => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) this.listeners.splice(index, 1);
  }

  public enqueue(event: T) {
    if (this.listeners.length === 0) {
      // If we've got no listeners then buffer them up
      this.queue.push(event);
    } else {
      for (const listener of this.listeners) listener(event);
    }
  }
}

export class Semaphore {
  private readonly listeners: Array<() => void> = [];

  public attach(listener: () => void) {
    this.listeners.push(listener);
  }

  public detach(listener: () => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) this.listeners.splice(index, 1);
  }

  public signal() {
    for (const listener of this.listeners) listener();
  }
}

export class PacketEvent {
  public readonly code: PacketCode;
  public readonly message: string;

  public constructor(code: PacketCode, message: string) {
    this.code = code;
    this.message = message;
  }
}
