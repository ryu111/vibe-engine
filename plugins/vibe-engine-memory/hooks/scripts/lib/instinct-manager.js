/**
 * Instinct Manager - Instinct 管理模組
 *
 * 提供 Instinct 的 CRUD 和分析功能：
 * - 創建 Instinct
 * - 讀取/列出 Instincts
 * - 更新（信心調整）
 * - 聚類檢測
 * - 演化建議
 *
 * 對應章節：Ch5 記憶系統 - Instinct Learning
 */

const fs = require('fs');
const path = require('path');
const { generateId, now } = require('./common');
const { getConfidenceIcon, adjustConfidence, THRESHOLDS } = require('./confidence');

/**
 * Instinct 領域
 */
const DOMAINS = {
  CODE_STYLE: 'code-style',
  TESTING: 'testing',
  WORKFLOW: 'workflow',
  ERROR_HANDLING: 'error-handling',
  DOCUMENTATION: 'documentation',
  ARCHITECTURE: 'architecture',
  PERFORMANCE: 'performance',
  SECURITY: 'security'
};

/**
 * 演化目標類型
 */
const EVOLUTION_TYPES = {
  COMMAND: 'command',   // 可重複的工作流程
  SKILL: 'skill',       // 領域知識集合
  AGENT: 'agent',       // 複雜、多步驟的專門角色
  RULE: 'rule'          // 必須遵守的約束
};

/**
 * InstinctManager 類別
 */
class InstinctManager {
  constructor(instinctsDir) {
    this.instinctsDir = instinctsDir;

    if (!fs.existsSync(instinctsDir)) {
      fs.mkdirSync(instinctsDir, { recursive: true });
    }
  }

  /**
   * 創建新 Instinct
   *
   * @param {object} params - { trigger, action, domain, confidence, evidence }
   * @returns {object} - { success, instinct, filePath }
   */
  create(params) {
    const {
      trigger,
      action,
      domain = DOMAINS.WORKFLOW,
      confidence = 0.5,
      evidence = []
    } = params;

    const id = generateId('inst');
    const timestamp = now();

    const frontmatter = [
      '---',
      `id: ${id}`,
      `trigger: "${trigger.replace(/"/g, '\\"')}"`,
      `confidence: ${confidence}`,
      `domain: "${domain}"`,
      `source: "session-observation"`,
      `created_at: "${timestamp}"`,
      `evidence_count: ${evidence.length}`,
      '---'
    ].join('\n');

    const title = this._generateTitle(trigger);

    const body = [
      '',
      `# ${title}`,
      '',
      '## Action',
      action,
      '',
      '## Evidence'
    ];

    for (const ev of evidence) {
      body.push(`- ${ev.date || timestamp.split('T')[0]}: ${ev.description}`);
    }

    const content = frontmatter + '\n' + body.join('\n') + '\n';
    const fileName = `${id}.md`;
    const filePath = path.join(this.instinctsDir, fileName);

    try {
      fs.writeFileSync(filePath, content);
      return {
        success: true,
        instinct: { id, trigger, action, domain, confidence, evidence_count: evidence.length },
        filePath
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 列出所有 Instincts
   *
   * @param {object} options - { domain, minConfidence }
   * @returns {Array}
   */
  list(options = {}) {
    const { domain = null, minConfidence = 0 } = options;
    const instincts = [];

    try {
      const files = fs.readdirSync(this.instinctsDir)
        .filter(f => f.endsWith('.md'));

      for (const file of files) {
        const inst = this._parseInstinctFile(path.join(this.instinctsDir, file));
        if (!inst) continue;

        // 過濾
        if (domain && inst.domain !== domain) continue;
        if (inst.confidence < minConfidence) continue;

        instincts.push(inst);
      }
    } catch (e) {
      // 目錄不存在或讀取錯誤
    }

    // 按信心分數排序
    instincts.sort((a, b) => b.confidence - a.confidence);

    return instincts;
  }

  /**
   * 根據 ID 獲取 Instinct
   */
  getById(id) {
    const filePath = path.join(this.instinctsDir, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    return this._parseInstinctFile(filePath);
  }

  /**
   * 更新 Instinct
   *
   * @param {string} id - Instinct ID
   * @param {object} updates - 要更新的欄位
   * @returns {object} - { success, instinct }
   */
  update(id, updates) {
    const filePath = path.join(this.instinctsDir, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Instinct not found' };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let newContent = content;

      // 更新 frontmatter 中的欄位
      for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}:.*$`, 'm');
        if (typeof value === 'string') {
          newContent = newContent.replace(regex, `${key}: "${value}"`);
        } else {
          newContent = newContent.replace(regex, `${key}: ${value}`);
        }
      }

      fs.writeFileSync(filePath, newContent);

      return {
        success: true,
        instinct: this._parseInstinctFile(filePath)
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 刪除 Instinct
   */
  delete(id) {
    const filePath = path.join(this.instinctsDir, `${id}.md`);

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Instinct not found' };
    }

    try {
      fs.unlinkSync(filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 調整信心分數
   *
   * @param {string} id - Instinct ID
   * @param {string} event - 事件類型
   * @returns {object}
   */
  adjustConfidenceById(id, event) {
    const inst = this.getById(id);
    if (!inst) {
      return { success: false, error: 'Instinct not found' };
    }

    const newConfidence = adjustConfidence(inst.confidence, event);

    return this.update(id, { confidence: newConfidence });
  }

  /**
   * 查找聚類（用於 /evolve）
   *
   * @param {number} threshold - 最小聚類大小
   * @returns {Array} - 聚類列表
   */
  findClusters(threshold = 3) {
    const instincts = this.list({ minConfidence: THRESHOLDS.INJECT });

    // 按 domain 分組
    const byDomain = {};
    for (const inst of instincts) {
      const domain = inst.domain || 'unknown';
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(inst);
    }

    // 識別達到閾值的聚類
    const clusters = [];
    for (const [domain, items] of Object.entries(byDomain)) {
      if (items.length >= threshold) {
        const avgConfidence = items.reduce((sum, i) => sum + i.confidence, 0) / items.length;

        clusters.push({
          domain,
          instincts: items,
          count: items.length,
          avgConfidence,
          suggestedType: this._suggestEvolutionType(items)
        });
      }
    }

    // 按平均信心排序
    clusters.sort((a, b) => b.avgConfidence - a.avgConfidence);

    return clusters;
  }

  /**
   * 獲取可演化的聚類
   */
  getReadyForEvolve(threshold = 3) {
    return this.findClusters(threshold).filter(c => c.avgConfidence >= 0.6);
  }

  /**
   * 獲取統計資訊
   */
  getStats() {
    const instincts = this.list();

    const stats = {
      total: instincts.length,
      byDomain: {},
      byConfidence: {
        high: 0,    // >= 0.7
        medium: 0,  // 0.5-0.7
        low: 0      // < 0.5
      },
      clustersReady: 0
    };

    for (const inst of instincts) {
      // 按 domain
      const domain = inst.domain || 'unknown';
      stats.byDomain[domain] = (stats.byDomain[domain] || 0) + 1;

      // 按信心
      if (inst.confidence >= 0.7) stats.byConfidence.high++;
      else if (inst.confidence >= 0.5) stats.byConfidence.medium++;
      else stats.byConfidence.low++;
    }

    stats.clustersReady = this.getReadyForEvolve().length;

    return stats;
  }

  /**
   * 格式化為顯示字串
   */
  formatForDisplay(instincts) {
    if (!instincts || instincts.length === 0) {
      return 'No instincts found.';
    }

    // 按 domain 分組
    const byDomain = {};
    for (const inst of instincts) {
      const domain = inst.domain || 'unknown';
      if (!byDomain[domain]) byDomain[domain] = [];
      byDomain[domain].push(inst);
    }

    const lines = [];

    for (const [domain, items] of Object.entries(byDomain)) {
      lines.push(`\n\u{1F4C1} ${domain} (${items.length})`);

      for (const inst of items.slice(0, 5)) { // 最多顯示 5 個
        const icon = getConfidenceIcon(inst.confidence);
        const conf = (inst.confidence * 100).toFixed(0);
        lines.push(`  ${icon} ${inst.trigger} (${conf}%, ${inst.evidence_count} evidence)`);
      }

      if (items.length > 5) {
        lines.push(`  ... (${items.length - 5} more)`);
      }
    }

    return lines.join('\n');
  }

  // === 私有方法 ===

  /**
   * 解析 Instinct 檔案
   */
  _parseInstinctFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');

      // 解析 YAML frontmatter
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return null;

      const yaml = match[1];
      const body = content.slice(match[0].length);

      // 提取欄位
      const id = yaml.match(/id:\s*(.+)/)?.[1]?.trim();
      const trigger = yaml.match(/trigger:\s*"?([^"\n]+)"?/)?.[1]?.trim();
      const confidence = parseFloat(yaml.match(/confidence:\s*([\d.]+)/)?.[1] || '0.5');
      const domain = yaml.match(/domain:\s*"?([^"\n]+)"?/)?.[1]?.trim();
      const created_at = yaml.match(/created_at:\s*"?([^"\n]+)"?/)?.[1]?.trim();
      const evidence_count = parseInt(yaml.match(/evidence_count:\s*(\d+)/)?.[1] || '0');

      // 提取 Action
      const actionMatch = body.match(/## Action\n([\s\S]*?)(?=\n## |$)/);
      const action = actionMatch?.[1]?.trim() || '';

      return {
        id,
        trigger,
        confidence,
        domain,
        created_at,
        evidence_count,
        action,
        filePath
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * 生成標題
   */
  _generateTitle(trigger) {
    // 將 trigger 轉為標題格式
    return trigger
      .replace(/^when\s+/i, '')
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * 建議演化類型
   */
  _suggestEvolutionType(instincts) {
    // 分析 instincts 的特徵來決定演化類型
    const triggers = instincts.map(i => i.trigger.toLowerCase());

    // 如果多個 instincts 是關於「不要做某事」→ Rule
    const negativeCount = triggers.filter(t =>
      t.includes('never') || t.includes('avoid') || t.includes("don't")
    ).length;

    if (negativeCount >= instincts.length * 0.5) {
      return EVOLUTION_TYPES.RULE;
    }

    // 如果多個 instincts 是關於步驟性操作 → Command
    const stepCount = triggers.filter(t =>
      t.includes('when') || t.includes('before') || t.includes('after')
    ).length;

    if (stepCount >= instincts.length * 0.5) {
      return EVOLUTION_TYPES.COMMAND;
    }

    // 如果涉及多個不同的觸發條件 → Skill
    const uniqueTriggerPatterns = new Set(triggers.map(t => t.split(/\s+/).slice(0, 2).join(' ')));

    if (uniqueTriggerPatterns.size >= 3) {
      return EVOLUTION_TYPES.SKILL;
    }

    // 預設為 Command
    return EVOLUTION_TYPES.COMMAND;
  }
}

module.exports = {
  InstinctManager,
  DOMAINS,
  EVOLUTION_TYPES
};
