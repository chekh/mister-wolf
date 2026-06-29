import { Clock } from '../../ports/clock.port.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
