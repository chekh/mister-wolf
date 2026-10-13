import { z } from 'zod';

// Волна 2.17 (design §События журнала): обязательные ключи payload новых
// face/proposal-событий. breakglass зеркалит versioned (также создаёт версию);
// from может быть null (первая версия) — проверяется наличие ключа, не тип.
const EVENT_PAYLOAD_KEYS: Readonly<Record<string, readonly string[]>> = {
  'memory.face.versioned': ['owner_skill', 'from', 'new', 'initiator', 'reason'],
  'memory.face.breakglass': ['owner_skill', 'from', 'new', 'initiator', 'reason'],
  'memory.face.denied': ['owner_skill', 'actor', 'command'],
  'memory.proposal.delivered': ['id', 'addressee'],
  // 2.17.1 REQ-03 (R04, design §3.3): журнал операции лица. op_started несёт
  // полный план шагов и полный набор аргументов (resume детерминирован из него);
  // op_step detail (id созданных объектов) — необязателен; op_aborted — by+reason.
  'memory.face.op_started': ['opId', 'command', 'owner_skill', 'plan', 'input'],
  'memory.face.op_step': ['opId', 'step'],
  'memory.face.op_committed': ['opId'],
  'memory.face.op_aborted': ['opId', 'by', 'reason'],
};

export const MemoryEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      'memory.added',
      'memory.edited',
      'memory.updated',
      'memory.scan.updated',
      'memory.superseded',
      'memory.resolved',
      'memory.transitioned',
      'memory.overwritten',
      'memory.aggregated',
      'memory.scope_promoted',
      // волна 2.17: face-операции и доставка предложений
      'memory.face.versioned',
      'memory.face.breakglass',
      'memory.face.denied',
      'memory.proposal.delivered',
      // 2.17.1 REQ-03 (R04): журналируемая цепочка шагов мутации лица (design §3.3)
      'memory.face.op_started',
      'memory.face.op_step',
      'memory.face.op_committed',
      'memory.face.op_aborted',
    ]),
    timestamp: z.string().datetime(),
    actor: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((ev, ctx) => {
    const required = EVENT_PAYLOAD_KEYS[ev.type];
    if (!required) return;
    for (const key of required) {
      if (ev.payload[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['payload', key],
          message: `event "${ev.type}" requires payload key "${key}"`,
        });
      }
    }
  });

export type MemoryEvent = z.infer<typeof MemoryEventSchema>;
