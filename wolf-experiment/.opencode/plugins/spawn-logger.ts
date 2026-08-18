// spawn-logger.ts — системный журнал спавнов + лимит воркеров для wolf-experiment.
// Автодискавери: .opencode/plugins/*.ts. Пишет JSONL в logs/spawn-log.jsonl.
// Лимит: env WOLF_WORKER_LIMIT (дефолт 3) — task.call, спавнящий worker-*,
// сверх лимита в сессии блокируется throw (вызов абортится до выполнения).
// Логгер не должен ломать эксперимент: ошибки записи глотаются (кроме блока).
import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"

const WORKER_LIMIT = Number.parseInt(process.env.WOLF_WORKER_LIMIT ?? "5", 10)
const workerSpawns = new Map<string, number>()

export default (async ({ client, directory }) => {
  const logPath = join(directory, "logs", "spawn-log.jsonl")
  const write = (entry: Record<string, unknown>) => {
    try {
      mkdirSync(dirname(logPath), { recursive: true })
      appendFileSync(logPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n")
    } catch {
      // логирование не должно ломать выполнение тулa
    }
  }
  const sessionAgent = async (sessionID: string): Promise<string | undefined> => {
    try {
      const s = (await client.session.get(sessionID)) as Record<string, unknown>
      return (s?.agent ?? s?.agentID ?? s?.agent_id) as string | undefined
    } catch {
      return undefined
    }
  }
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string },
      output: { args?: Record<string, unknown> },
    ) => {
      if (input.tool !== "task") return
      const args = output?.args ?? {}
      const isWorker = String(args.subagent_type ?? "").startsWith("worker-")
      const used = workerSpawns.get(input.sessionID) ?? 0
      if (isWorker && used >= WORKER_LIMIT) {
        write({
          event: "task.blocked",
          sessionID: input.sessionID,
          subagent_type: args.subagent_type,
          reason: `worker limit reached (${WORKER_LIMIT})`,
        })
        throw new Error(
          `Worker limit reached: session already spawned ${used} workers (limit ${WORKER_LIMIT}). ` +
            `Reuse an existing worker via task_id or finish with the current workers.`,
        )
      }
      if (isWorker) workerSpawns.set(input.sessionID, used + 1)
      write({
        event: "task.call",
        sessionID: input.sessionID,
        agent: await sessionAgent(input.sessionID),
        subagent_type: args.subagent_type,
        description: args.description,
        workers_used_after: isWorker ? used + 1 : undefined,
        prompt: String(args.prompt ?? "").slice(0, 80),
      })
    },
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; args?: Record<string, unknown> },
      output: unknown,
    ) => {
      if (input.tool !== "task") return
      const o = output as { title?: string; output?: string } | undefined
      const text = String(o?.output ?? "")
      write({
        event: "task.result",
        sessionID: input.sessionID,
        subagent_type: input.args?.subagent_type,
        title: o?.title,
        ok: !/error|denied|prevents|limit reached|ошибк|предел|недостат/i.test(text.slice(0, 400)),
        snippet: text.replace(/\s+/g, " ").slice(0, 160),
      })
    },
  }
}) satisfies Plugin
