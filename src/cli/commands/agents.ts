import { Command, Option } from 'commander';
import { loadProjectConfig } from '../../config/project-config.js';
import { AgentRegistry } from '../../agent/registry.js';
import { ModelRouter } from '../../agent/router.js';

export function createAgentsCommand(): Command {
  const agents = new Command('agents').description('Manage agents');

  agents
    .command('list')
    .description('List all agents')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (options: { json?: boolean }) => {
      const config = loadProjectConfig();
      const registry = new AgentRegistry(config.agents);

      if (options.json) {
        console.log(JSON.stringify(registry.list(), null, 2));
      } else {
        const list = registry.list();
        if (list.length === 0) {
          console.log('No agents configured.');
          return;
        }
        console.log(`Agents (${list.length}):`);
        for (const agent of list) {
          const name = agent.name || agent.id;
          console.log(`  ${agent.id.padEnd(12)} ${name.padEnd(20)} route: ${agent.model_route}`);
        }
      }
    });

  agents
    .command('inspect')
    .description('Inspect an agent')
    .argument('<id>', 'Agent id')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (id: string, options: { json?: boolean }) => {
      const config = loadProjectConfig();
      const registry = new AgentRegistry(config.agents);
      const router = new ModelRouter(config.models.routes);

      const agent = registry.get(id);
      if (!agent) {
        console.error(`Agent not found: ${id}`);
        process.exit(1);
      }

      const route = router.resolve(agent.model_route);

      if (options.json) {
        console.log(JSON.stringify({ ...agent, resolved_route: route }, null, 2));
      } else {
        console.log(`Agent: ${agent.id}`);
        console.log(`  Name: ${agent.name || '(none)'}`);
        console.log(`  Description: ${agent.description || '(none)'}`);
        console.log(`  Capabilities: ${agent.capabilities.join(', ') || '(none)'}`);
        console.log(`  Tools: ${agent.tools.join(', ') || '(none)'}`);
        console.log(`  Model Route: ${agent.model_route}`);
        console.log(`  Provider: ${route.provider}`);
        console.log(`  Model: ${route.model}`);
        if (route.purpose) console.log(`  Purpose: ${route.purpose}`);
        if (route.max_tokens) console.log(`  Max Tokens: ${route.max_tokens}`);
      }
    });

  return agents;
}
