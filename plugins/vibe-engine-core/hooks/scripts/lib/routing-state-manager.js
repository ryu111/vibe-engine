/**
 * Routing State Manager - 路由狀態追蹤
 *
 * 功能：
 * 1. 創建和追蹤路由計劃的執行狀態
 * 2. 標記任務完成
 * 3. 獲取未完成任務
 * 4. 支援閉環驗證（Stop hook 檢查）
 *
 * 對應章節：Ch1 協調引擎 - 自動路由
 */

const fs = require('fs');
const path = require('path');
const { getVibeEnginePaths, safeReadJSON, safeWriteJSON, generateId, now } = require('./common');

const ROUTING_STATE_FILE = 'routing-state.json';

// Agent 並行限制
const CONCURRENCY_LIMITS = {
  architect: 1, developer: 2, tester: 1, reviewer: 1, explorer: 3
};

/**
 * 路由狀態管理器
 */
class RoutingStateManager {
  constructor(projectRoot = null) {
    this.paths = getVibeEnginePaths(projectRoot);
    this.filePath = path.join(this.paths.root, ROUTING_STATE_FILE);
  }

  /**
   * 創建新的路由計劃狀態
   * @param {object} plan - 路由計劃（來自 agent-router 的 generateRoutingPlan）
   * @param {string} originalRequest - 用戶原始請求
   * @returns {object} 創建的狀態
   */
  createPlan(plan, originalRequest = '') {
    const planId = generateId('route');

    // 展開所有任務
    const allTasks = [];
    const phases = (plan.phases || []).map((phase, phaseIndex) => {
      const phaseTasks = (phase.tasks || []).map(task => {
        const taskState = {
          id: task.id || generateId('task'),
          agent: task.agent,
          description: task.description || '',
          model: task.model || 'sonnet',
          status: 'pending',  // pending | executing | completed | failed | skipped
          startedAt: null,
          completedAt: null,
          error: null
        };
        allTasks.push(taskState);
        return taskState;
      });

      return {
        phase: phaseIndex + 1,
        parallel: phase.parallel || false,
        tasks: phaseTasks
      };
    });

    const state = {
      planId,
      createdAt: now(),
      updatedAt: now(),
      originalRequest,
      status: 'pending',  // pending | in_progress | completed | failed | cancelled
      strategy: plan.strategy || 'sequential',
      phases,

      // 統計
      totalCount: allTasks.length,
      completedCount: 0,
      failedCount: 0,

      // 控制
      maxRetries: 3,
      currentRetry: 0,

      // 追蹤
      taskIndex: {}  // taskId -> { phaseIndex, taskIndex }
    };

    // 建立任務索引
    phases.forEach((phase, pi) => {
      phase.tasks.forEach((task, ti) => {
        state.taskIndex[task.id] = { phaseIndex: pi, taskIndex: ti };
      });
    });

    this.save(state);
    return state;
  }

  /**
   * 載入當前路由狀態
   * @returns {object|null}
   */
  load() {
    return safeReadJSON(this.filePath, null);
  }

  /**
   * 保存路由狀態
   * @param {object} state
   */
  save(state) {
    state.updatedAt = now();
    safeWriteJSON(this.filePath, state);
    return state;
  }

  /**
   * 標記任務開始執行
   * @param {string} taskId
   * @returns {object|null} 更新後的狀態
   */
  markTaskStarted(taskId) {
    const state = this.load();
    if (!state) return null;

    const index = state.taskIndex[taskId];
    if (!index) return state;

    const task = state.phases[index.phaseIndex].tasks[index.taskIndex];
    task.status = 'executing';
    task.startedAt = now();

    // 更新整體狀態
    if (state.status === 'pending') {
      state.status = 'in_progress';
    }

    return this.save(state);
  }

  /**
   * 標記任務完成
   * @param {string} taskId
   * @returns {object|null} 更新後的狀態
   */
  markTaskCompleted(taskId) {
    const state = this.load();
    if (!state) return null;

    const index = state.taskIndex[taskId];
    if (!index) return state;

    const task = state.phases[index.phaseIndex].tasks[index.taskIndex];
    task.status = 'completed';
    task.completedAt = now();
    state.completedCount++;

    // 檢查是否全部完成
    if (state.completedCount >= state.totalCount) {
      state.status = 'completed';
    }

    return this.save(state);
  }

  /**
   * 標記任務失敗
   * @param {string} taskId
   * @param {string} error - 錯誤訊息
   * @returns {object|null}
   */
  markTaskFailed(taskId, error = '') {
    const state = this.load();
    if (!state) return null;

    const index = state.taskIndex[taskId];
    if (!index) return state;

    const task = state.phases[index.phaseIndex].tasks[index.taskIndex];
    task.status = 'failed';
    task.completedAt = now();
    task.error = error;
    state.failedCount++;

    return this.save(state);
  }

  /**
   * 獲取未完成的任務（考慮 phase 依賴）
   * @returns {Array} 可執行的未完成任務
   */
  getPendingTasks() {
    const state = this.load();
    if (!state || state.status === 'completed' || state.status === 'cancelled') {
      return [];
    }

    const pendingTasks = [];

    for (const phase of state.phases) {
      const phasePending = phase.tasks.filter(t => t.status === 'pending');
      const phaseExecuting = phase.tasks.filter(t => t.status === 'executing');
      const phaseCompleted = phase.tasks.filter(t => t.status === 'completed');

      // 如果這個 phase 有未完成的任務
      if (phasePending.length > 0) {
        if (phase.parallel) {
          // 並行 phase：返回所有未開始的
          pendingTasks.push(...phasePending);
        } else {
          // 序列 phase：只返回第一個未開始的
          pendingTasks.push(phasePending[0]);
        }

        // 如果是序列策略，前一個 phase 未完成則不返回後續
        if (state.strategy === 'sequential' &&
            (phasePending.length > 0 || phaseExecuting.length > 0)) {
          break;
        }
      }

      // 如果 phase 有正在執行的任務且是序列策略，不繼續到下一個 phase
      if (phaseExecuting.length > 0 && state.strategy === 'sequential') {
        break;
      }
    }

    return pendingTasks;
  }

  /**
   * 獲取可立即執行的任務（考慮 agent 並行上限）
   * 與 getPendingTasks() 不同：getPendingTasks 返回所有待執行任務（用於完成度判斷），
   * getExecutableTasks 考慮正在執行的 agent 數量限制（用於實際分派）
   * @returns {Array} 可立即分派的任務
   */
  getExecutableTasks() {
    const state = this.load();
    if (!state || state.status === 'completed' || state.status === 'cancelled') {
      return [];
    }

    // 統計正在執行的 agent 數量
    const executingByAgent = {};
    for (const phase of state.phases) {
      for (const task of phase.tasks) {
        if (task.status === 'executing') {
          executingByAgent[task.agent] = (executingByAgent[task.agent] || 0) + 1;
        }
      }
    }

    // 過濾：只返回不超過並行限制的任務
    const pending = this.getPendingTasks();
    return pending.filter(task => {
      const limit = CONCURRENCY_LIMITS[task.agent] || 2;
      const current = executingByAgent[task.agent] || 0;
      if (current < limit) {
        executingByAgent[task.agent] = current + 1;
        return true;
      }
      return false;
    });
  }

  /**
   * 檢查計劃是否完成
   * @returns {boolean}
   */
  isCompleted() {
    const state = this.load();
    return state?.status === 'completed';
  }

  /**
   * 檢查計劃是否失敗
   * @returns {boolean}
   */
  isFailed() {
    const state = this.load();
    return state?.status === 'failed';
  }

  /**
   * 檢查是否有活躍的計劃
   * @returns {boolean}
   */
  hasActivePlan() {
    const state = this.load();
    return state && (state.status === 'pending' || state.status === 'in_progress');
  }

  /**
   * 標記計劃完成
   * @returns {object|null}
   */
  markPlanCompleted() {
    const state = this.load();
    if (!state) return null;

    state.status = 'completed';
    return this.save(state);
  }

  /**
   * 標記計劃失敗
   * @param {string} reason
   * @returns {object|null}
   */
  markPlanFailed(reason = '') {
    const state = this.load();
    if (!state) return null;

    state.status = 'failed';
    state.failReason = reason;
    return this.save(state);
  }

  /**
   * 增加重試計數
   * @returns {object} { canRetry, currentRetry, maxRetries }
   */
  incrementRetry() {
    const state = this.load();
    if (!state) return { canRetry: false, currentRetry: 0, maxRetries: 3 };

    state.currentRetry = (state.currentRetry || 0) + 1;
    this.save(state);

    return {
      canRetry: state.currentRetry < state.maxRetries,
      currentRetry: state.currentRetry,
      maxRetries: state.maxRetries
    };
  }

  /**
   * 清除路由狀態
   */
  clear() {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }

  /**
   * 根據 agent 名稱查找任務
   * @param {string} agentName
   * @returns {Array}
   */
  findTasksByAgent(agentName) {
    const state = this.load();
    if (!state) return [];

    const tasks = [];
    for (const phase of state.phases) {
      for (const task of phase.tasks) {
        if (task.agent === agentName) {
          tasks.push(task);
        }
      }
    }
    return tasks;
  }

  /**
   * 獲取執行摘要
   * @returns {object}
   */
  getSummary() {
    const state = this.load();
    if (!state) {
      return {
        hasActivePlan: false,
        planId: null,
        status: 'none',
        progress: '0/0',
        pendingCount: 0
      };
    }

    const pending = this.getPendingTasks();

    return {
      hasActivePlan: this.hasActivePlan(),
      planId: state.planId,
      status: state.status,
      progress: `${state.completedCount}/${state.totalCount}`,
      completedCount: state.completedCount,
      totalCount: state.totalCount,
      failedCount: state.failedCount,
      pendingCount: pending.length,
      currentRetry: state.currentRetry || 0,
      maxRetries: state.maxRetries || 3
    };
  }
}

module.exports = {
  RoutingStateManager,
  ROUTING_STATE_FILE,
  CONCURRENCY_LIMITS
};
