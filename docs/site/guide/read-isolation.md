# Read Isolation

Where worktree-scoped memory is filtered — and where it is not. This page is the frozen
contract (NFR-03, design 2.17.1 §6): the composition below changes only through a
requirements change, never silently in code.

Worktree scope exists so that memory written inside a linked worktree copy
(`worktree:<id>`) stays in that copy: injections do not leak into other copies or into
the main checkout. Promoting a record to shared memory is an explicit command —
`wolf promote`.

## Isolated: `wolf call` and `wolf brief`

The delivery path applies the scope filter in every selection branch:

- `wolf call` — all modes: default, `--for <topic>`, `--thread <id>`;
- `wolf brief` — accepted memory, open questions and blockers go through the same
  admission policy (3.2.1, unified delivery admission: applicability, contradiction
  suppression and worktree scope on every section);
- the MCP channel mirrors the CLI command list: a `call` tool in the MCP catalog
  inherits the same isolation, and `mr-wolf_brief` is isolated exactly like the CLI
  `wolf brief` (same use-case). Today's `call` MCP tool does not exist in the
  catalog (`search`, `get`, `list`, `add`, `transition`, `brief`, `recap` + `ping`).

## Not isolated: the whole project memory

Everything else reads the whole project memory:

- `wolf search` / `get` / `list` / `show`;
- `wolf recap`;
- `wolf think` / `solve`;
- `wolf doctor`;
- relation and analytics paths (`wolf relation`, `wolf analytics`);
- face commands (`wolf face list/history/show`) — faces are filtered by `owner_skill`,
  not by scope.

The MCP read tools (`mr-wolf_search`, `mr-wolf_get`, `mr-wolf_list`,
`mr-wolf_recap`) mirror these CLI commands and are not isolated either: the MCP surface
is a mirror of the CLI list, there is no separate isolation behavior.

## Extending the list

Adding a new isolated read path is a requirements change, not a code-time decision. The
composition above is guarded by a doc-test (`tests/unit/read-isolation-doc.test.ts`)
that fails when the visibility predicate appears outside the delivery admission path
(`call` / `brief`, the admission module and the micro-note selector) or when the
documents drift from the frozen list.

History: 2.17.1 froze the list as `wolf call` only; 3.2.1 extended isolation to
`wolf brief` (owner decision R-2: one admission filter for every output section).
