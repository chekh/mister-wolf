import { Command } from 'commander';
import { createArticle } from '../../../app/use-cases/create-article.js';
import { listMemoryObjects } from '../../../app/use-cases/list-memory-objects.js';
import { createCliContainer } from '../../../bootstrap/container.js';
import { Article } from '../../../domain/schemas/article-schema.js';

export function memoryArticleCommand(): Command {
  const article = new Command('article').description('Manage articles');

  article
    .command('add')
    .description('Add an article')
    .requiredOption('--title <title>', 'Article title')
    .requiredOption('--thread <thread-id>', 'Parent thread id')
    .requiredOption('--summary <summary>', 'Article summary')
    .requiredOption('--body <body>', 'Article body')
    .option('--answers <ids>', 'Comma-separated answered info-request ids')
    .option('--supports <items>', 'Comma-separated items this article supports')
    .option('--evidence <items>', 'Comma-separated evidence items')
    .option('--created-by <actor>', 'Creator actor', 'user:cli')
    .action(async (options) => {
      const { store, log, clock, idGen } = createCliContainer(process.cwd());
      const result = await createArticle(
        { store, log, clock, idGen },
        {
          title: options.title,
          thread: options.thread,
          summary: options.summary,
          body: options.body,
          answers: options.answers ? options.answers.split(',').map((s: string) => s.trim()) : [],
          supports: options.supports ? options.supports.split(',').map((s: string) => s.trim()) : [],
          evidence: options.evidence ? options.evidence.split(',').map((s: string) => s.trim()) : [],
          createdBy: options.createdBy,
        }
      );
      console.log(`Created article: ${result.object.id}`);
    });

  article
    .command('list')
    .description('List articles')
    .option('--thread <thread-id>', 'Filter by thread')
    .action(async (options) => {
      const { store } = createCliContainer(process.cwd());
      const objects = await listMemoryObjects(store, { type: 'article' });
      for (const obj of objects) {
        if (options.thread && (obj as Article).thread !== options.thread) continue;
        console.log(`${obj.id} [${obj.status}] ${obj.title}`);
      }
    });

  return article;
}
