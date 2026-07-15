export abstract class BaseEvent {
  public readonly timestamp: Date;

  constructor(public readonly eventName: string) {
    this.timestamp = new Date();
  }
}
