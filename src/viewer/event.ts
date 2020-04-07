import type { Packet } from "../network";
export { Semaphore } from "cc-web-term";

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

  /** Fire the event if listeners exist, buffering it if not */
  public enqueue(event: T) {
    if (this.listeners.length === 0) {
      // If we've got no listeners then buffer them up
      this.queue.push(event);
    } else {
      for (const listener of this.listeners) listener(event);
    }
  }

  /** Fire the event if listeners exist, discarding it if not */
  public offer(event: T) {
    for (const listener of this.listeners) listener(event);
  }
}

export class PacketEvent {
  public readonly packet: Packet;

  public constructor(packet: Packet) {
    this.packet = packet;
  }
}
