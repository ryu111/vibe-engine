#!/usr/bin/env node
/**
 * Checkpoint Handler - /checkpoint CLI 入口
 *
 * 用法：
 *   node checkpoint-handler.js create <name> [description]
 *   node checkpoint-handler.js verify <name>
 *   node checkpoint-handler.js list
 *   node checkpoint-handler.js clear [keep]
 *   node checkpoint-handler.js delete <name>
 *
 * 對應章節：Ch3 狀態管理
 */

const { getProjectRoot, ensureVibeEngineDirs } = require('./lib/common');
const { CheckpointManager } = require('./lib/checkpoint-manager');

function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  const projectRoot = getProjectRoot();
  const paths = ensureVibeEngineDirs(projectRoot);
  const manager = new CheckpointManager(paths.checkpoints);

  switch (action) {
    case 'create': {
      const name = args[1];
      const description = args.slice(2).join(' ');
      if (!name) {
        console.error('Usage: checkpoint create <name> [description]');
        process.exit(1);
      }
      const result = manager.create(name, { description });
      if (result.success) {
        const cp = result.checkpoint;
        console.log(`✅ Checkpoint "${cp.name}" created`);
        console.log(`   SHA: ${cp.metrics?.git_sha?.substring(0, 7) || 'N/A'}`);
        console.log(`   Status: ${cp.metrics?.git_status || 'unknown'}`);
        console.log(`   Files: ${cp.metrics?.files_count || 0}`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'verify': {
      const name = args[1];
      if (!name) {
        console.error('Usage: checkpoint verify <name>');
        process.exit(1);
      }
      const result = manager.verify(name);
      if (result.success) {
        console.log(`Status: ${result.status}`);
        console.log(`SHA changed: ${result.diff.sha_changed}`);
        console.log(`Files added: ${result.diff.files_added}`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      const checkpoints = manager.list();
      console.log(manager.formatForDisplay(checkpoints));
      break;
    }

    case 'clear': {
      const keep = parseInt(args[1]) || 5;
      const result = manager.clear(keep);
      console.log(`Deleted: ${result.deleted}, Kept: ${result.kept}`);
      break;
    }

    case 'delete': {
      const name = args[1];
      if (!name) {
        console.error('Usage: checkpoint delete <name>');
        process.exit(1);
      }
      const result = manager.delete(name);
      if (result.success) {
        console.log(`✅ Deleted "${name}"`);
      } else {
        console.error(`❌ ${result.error}`);
        process.exit(1);
      }
      break;
    }

    default:
      console.error('Usage: checkpoint <create|verify|list|clear|delete> [args]');
      process.exit(1);
  }
}

module.exports = { main };

if (require.main === module) {
  main();
}
