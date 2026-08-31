<script setup lang="ts">
// Static by design: no typing animation (reduced-motion friendly).
</script>

<template>
  <div class="wolf-terminal" aria-label="wolf call — session injection preview">
    <div class="wolf-terminal-bar">
      <span class="dot dot-signal" />
      <span class="dot dot-brass" />
      <span class="dot dot-verified" />
      <span class="wolf-terminal-title">wolf · session-injection</span>
    </div>
    <div class="wolf-terminal-body">
      <p class="wolf-terminal-cmd">$ wolf call --for &quot;auth refactor&quot;</p>

      <ul class="wolf-thread">
        <li class="wolf-thread-item">
          <span class="node" aria-hidden="true" />
          <span class="type">RULE</span>
          <span class="id">mem_20260824_2b29ad</span>
          <span class="status st-active">&#9679; ACTIVE</span>
          <span class="desc">Limited retries for subagents: fail &rarr; escalate</span>
        </li>
        <li class="wolf-thread-item">
          <span class="node" aria-hidden="true" />
          <span class="type">LESSON</span>
          <span class="id">mem_20260825_41c0e8</span>
          <span class="status st-verified">&#10003; VERIFIED</span>
          <span class="desc">Token-optimized shell output for agent workers</span>
        </li>
        <li class="wolf-thread-item">
          <span class="node" aria-hidden="true" />
          <span class="type">DECISION</span>
          <span class="id">mem_20260823_858573</span>
          <span class="status st-active">&#9679; ACTIVE</span>
          <span class="desc">Trunk-based git flow: main is the single truth</span>
        </li>
        <li class="wolf-thread-item is-last">
          <span class="node" aria-hidden="true" />
          <span class="type">BLOCKER</span>
          <span class="id">mem_20260831_65fbb8</span>
          <span class="status st-blocked">&times; BLOCKED</span>
          <span class="desc">CI publish blocked by billing &mdash; rerun pending</span>
        </li>
      </ul>

      <p class="wolf-terminal-result">&#10003; 4 relevant memories selected</p>
    </div>
  </div>
</template>
