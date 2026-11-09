# Capabilities and boundaries

Wolf brings several familiar mechanisms together around the project's goal and continuing state. Its value is in their relationship: the process chooses methods and context, assigns responsibility, checks a result and carries experience into later work.

## How Wolf relates to other solutions

This is a comparison of approaches, not a ranking of products. Categories overlap; a particular product may span several rows.

| Approach                     | Main focus                     | Wolf's emphasis                                                                            |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Agent memory                 | Store and retrieve context     | Connect memory to work state, responsibility, acceptance and changes to methods            |
| Skill and prompt collections | Reusable instructions          | Use skills, tools, rules and memory together in a goal-directed process                    |
| Agent harness                | Run models, sessions and tools | Maintain project organization and experience across sessions through a harness integration |
| Multi-agent framework        | Coordinate agents              | Preserve the goal, organizational state and governed learning over repeated assignments    |
| Knowledge base               | Keep documents and information | Apply project documents and experience in ongoing work and feed significant results back   |

Wolf can complement these systems. It still depends on the harness for agent execution and on configured providers for model calls.

## Current delivery

| Area             | What to expect                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization     | The supplied two-level organization — mr-wolf plus eight wolf-\* specialists — primarily exercised in OpenCode                                         |
| Memory           | Local Markdown objects, relations, lifecycle and an FTS search index; project document references                                                      |
| Skills and tools | Shipped process skills, project tool registration and reuse contracts                                                                                  |
| Steward          | Authorized face versioning and complaint handling methods; in 3.0.0 the Steward is temporarily out of standard routing and returns in the next release |
| Control          | CLI/MCP, history, upgrade review, analytics and owner face restore operations                                                                          |
| Other platforms  | Memory/process access through MCP; optional platform configuration does not establish full organizational parity                                       |

The organization includes instructions and harness permissions. Do not treat every instruction as runtime enforcement. Fresh-session isolation depends on what the host actually passes; checkpoints preserve meaning, not leases or running processes. [Organization](/guide/organization) and [Delivery](/guide/delivery) explain these boundaries.

## Direction and limits

The methods support research, documents, reports and software work. The current repository-oriented package is not a ready integration for every profession. The expert council is available today as a method with a durable record path (see [Expert Council](/guide/council)); a dedicated user console and external durable execution integration remain future work. Memory aging and revalidation designs are not guarantees of automatic knowledge freshness.

Local-first means project state is kept in local files; selected context can still leave the machine through your model provider and configured tools. [Read isolation](/guide/read-isolation) is a delivery-scoping contract, not general access control.

## Assess usefulness in your own work

Look at a concrete result: was the goal understood, was the output acceptable, could work continue from saved state, and was an intended method change delivered? [Analytics](/guide/analytics) can help investigate observations. Metrics supplement the explanation; there is no universal claim that Wolf is faster, cheaper or better than another product.

For implementation details and research history, consult the repository's [engineering documentation](https://github.com/chekh/mister-wolf/blob/main/docs/README.md).
