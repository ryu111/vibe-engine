#!/usr/bin/env node
/**
 * Health Check Script
 *
 * 功能：
 * 1. 執行代碼健康度檢查
 * 2. 計算複雜度、重複度等指標
 * 3. 生成健康報告
 *
 * 對應章節：Ch10 方法論
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 獲取專案根目錄
 */
function getProjectRoot() {
  if (process.env.CLAUDE_PROJECT_ROOT) {
    return process.env.CLAUDE_PROJECT_ROOT;
  }

  const cwd = process.cwd();
  if (cwd.includes('.claude/plugins/cache')) {
    return path.join(process.env.HOME || '/tmp', '.vibe-engine-global');
  }

  let current = cwd;
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.git')) ||
        fs.existsSync(path.join(current, '.vibe-engine')) ||
        fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }

  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const VIBE_ENGINE_DIR = path.join(PROJECT_ROOT, '.vibe-engine');
const HEALTH_DIR = path.join(VIBE_ENGINE_DIR, 'health');

/**
 * 計算檔案的循環複雜度（簡化版）
 */
function estimateComplexity(content) {
  // 計算控制流關鍵字數量作為複雜度近似值
  const patterns = [
    /\bif\b/g,
    /\belse\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bswitch\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\s*:/g,  // ternary operator
    /&&/g,
    /\|\|/g
  ];

  let complexity = 1;  // 基礎複雜度
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}

/**
 * 檢測重複代碼（簡化版）
 */
function detectDuplication(files) {
  const lineMap = new Map();
  let totalLines = 0;
  let duplicateLines = 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      totalLines += lines.length;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 20) {  // 忽略短行
          if (lineMap.has(trimmed)) {
            duplicateLines++;
          } else {
            lineMap.set(trimmed, file);
          }
        }
      }
    } catch (e) {
      // 忽略無法讀取的檔案
    }
  }

  return {
    totalLines,
    duplicateLines,
    percentage: totalLines > 0 ? ((duplicateLines / totalLines) * 100).toFixed(1) : 0
  };
}

/**
 * 獲取專案中的程式檔案
 */
function getSourceFiles() {
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java'];
  const files = [];

  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // 跳過特定目錄
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build', '.vibe-engine'].includes(entry.name)) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // 忽略無法訪問的目錄
    }
  }

  walk(PROJECT_ROOT);
  return files;
}

/**
 * 計算健康分數
 */
function calculateHealthScore(metrics) {
  let score = 100;

  // 複雜度扣分（每超過 10 扣 2 分）
  if (metrics.avgComplexity > 10) {
    score -= Math.min(30, (metrics.avgComplexity - 10) * 2);
  }

  // 重複度扣分（每 1% 扣 1 分）
  score -= Math.min(20, parseFloat(metrics.duplication.percentage));

  // 檔案過大扣分
  if (metrics.maxComplexity > 50) {
    score -= 10;
  }

  return Math.max(0, Math.round(score));
}

/**
 * 獲取等級
 */
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * 獲取狀態
 */
function getStatus(score) {
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'WARNING';
  return 'CRITICAL';
}

/**
 * 執行健康檢查
 */
function runHealthCheck() {
  const files = getSourceFiles();

  if (files.length === 0) {
    return {
      score: 100,
      grade: 'A',
      status: 'HEALTHY',
      metrics: {
        filesAnalyzed: 0,
        avgComplexity: 0,
        maxComplexity: 0,
        duplication: { totalLines: 0, duplicateLines: 0, percentage: '0' }
      },
      criticalIssues: 0,
      message: 'No source files found to analyze'
    };
  }

  // 計算複雜度
  const complexities = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const complexity = estimateComplexity(content);
      complexities.push({ file, complexity });
    } catch (e) {
      // 忽略
    }
  }

  const avgComplexity = complexities.length > 0
    ? complexities.reduce((sum, c) => sum + c.complexity, 0) / complexities.length
    : 0;
  const maxComplexity = complexities.length > 0
    ? Math.max(...complexities.map(c => c.complexity))
    : 0;

  // 檢測重複
  const duplication = detectDuplication(files);

  // 計算分數
  const metrics = {
    filesAnalyzed: files.length,
    avgComplexity: Math.round(avgComplexity * 10) / 10,
    maxComplexity,
    duplication
  };

  const score = calculateHealthScore(metrics);
  const grade = getGrade(score);
  const status = getStatus(score);

  // 計算 critical issues
  let criticalIssues = 0;
  if (avgComplexity > 20) criticalIssues++;
  if (parseFloat(duplication.percentage) > 10) criticalIssues++;
  if (maxComplexity > 100) criticalIssues++;

  return {
    score,
    grade,
    status,
    metrics,
    criticalIssues,
    highComplexityFiles: complexities
      .filter(c => c.complexity > 20)
      .slice(0, 5)
      .map(c => ({ file: path.relative(PROJECT_ROOT, c.file), complexity: c.complexity }))
  };
}

/**
 * 保存報告
 */
function saveReport(report) {
  try {
    if (!fs.existsSync(HEALTH_DIR)) {
      fs.mkdirSync(HEALTH_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(HEALTH_DIR, `health-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

    // 也保存為 latest
    fs.writeFileSync(path.join(HEALTH_DIR, 'latest.json'), JSON.stringify(report, null, 2));

    return filePath;
  } catch (e) {
    return null;
  }
}

/**
 * 主函數
 */
async function main() {
  let input = '';

  // 讀取 stdin
  if (!process.stdin.isTTY) {
    process.stdin.setEncoding('utf8');
    await new Promise((resolve) => {
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', resolve);
    });
  }

  const report = runHealthCheck();
  const savedTo = saveReport(report);

  // 生成 CHECKPOINT 格式輸出
  const complexityStatus = report.metrics.avgComplexity < 10 ? '🟢' :
    report.metrics.avgComplexity < 20 ? '🟡' : '🔴';
  const duplicationStatus = parseFloat(report.metrics.duplication.percentage) < 5 ? '🟢' :
    parseFloat(report.metrics.duplication.percentage) < 10 ? '🟡' : '🔴';

  const checkpoint = `[CHECKPOINT] Health Check Complete
├─ Overall Score：${report.score}/100 (Grade: ${report.grade})
├─ Complexity：${complexityStatus} (avg: ${report.metrics.avgComplexity})
├─ Duplication：${duplicationStatus} (${report.metrics.duplication.percentage}%)
├─ Critical Issues：${report.criticalIssues}
└─ 狀態：${report.status}`;

  // 判斷是作為 hook 還是獨立執行
  if (input.trim()) {
    // Hook 模式
    console.log(JSON.stringify({
      continue: true,
      suppressOutput: false,
      systemMessage: checkpoint
    }));
  } else {
    // 獨立執行模式
    console.log('\n' + checkpoint);
    console.log(`\nFiles analyzed: ${report.metrics.filesAnalyzed}`);
    if (report.highComplexityFiles && report.highComplexityFiles.length > 0) {
      console.log('\nHigh complexity files:');
      for (const f of report.highComplexityFiles) {
        console.log(`  - ${f.file}: ${f.complexity}`);
      }
    }
    if (savedTo) {
      console.log(`\nReport saved to: ${savedTo}`);
    }
  }
}

main().catch(console.error);
