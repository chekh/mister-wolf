import { describe, it, expect, vi } from 'vitest';
import { EventBus, InProcessEventBus } from '../../src/kernel/event-bus.js';
import { RuntimeEvent } from '../../src/types/events.js';

describe('InProcessEventBus', () => {
  it('should publish and receive events', async () => {
    const bus = new InProcessEventBus();
    const handler = vi.fn();
    bus.subscribe('test.event', handler);
    
    const event: RuntimeEvent = {
      id: 'evt_1',
      type: 'test.event',
      case_id: 'case_1',
      timestamp: new Date().toISOString(),
      actor: { type: 'system', id: 'test' },
      payload: {},
    };
    
    await bus.publish(event);
    expect(handler).toHaveBeenCalledWith(event);
  });
  
  it('should support multiple subscribers', async () => {
    const bus = new InProcessEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.subscribe('test.event', handler1);
    bus.subscribe('test.event', handler2);
    
    const event: RuntimeEvent = {
      id: 'evt_1',
      type: 'test.event',
      case_id: 'case_1',
      timestamp: new Date().toISOString(),
      actor: { type: 'system', id: 'test' },
      payload: {},
    };
    
    await bus.publish(event);
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });
});
