/**
 * KAVACH Dashboard Application
 * Modular, performance-optimized vanilla JS architecture
 */

document.documentElement.classList.add('js-enabled');

// ==========================================
// State Management
// ==========================================

const Store = {
  data: {
    transactions: [],
    insights: {},
    categoryChart: { labels: [], values: [] },
    monthlyTrends: [],
    userProfile: {},
    sampleRows: [],
    aiHistory: [],
    ui: {
      darkMode: true,
      sidebarCollapsed: false,
      chartType: 'doughnut',
      currentPage: 1,
      pageSize: 25,
      timeRange: 'all',
      riskThreshold: 0.6,
      showAdvanced: false
    }
  },
  
  listeners: new Set(),
  
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },
  
  notify(path, value) {
    this.listeners.forEach(cb => cb(path, value));
  },
  
  set(path, value) {
    const keys = path.split('.');
    let target = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
    this.notify(path, value);
  },
  
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.data);
  }
};

// ==========================================
// DOM Utilities
// ==========================================

const DOM = {
  $(selector, context = document) {
    return context.querySelector(selector);
  },
  
  $$(selector, context = document) {
    return Array.from(context.querySelectorAll(selector));
  },
  
  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'className') el.className = val;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
      else el.setAttribute(key, val);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    });
    return el;
  },
  
  debounce(fn, ms) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  },
  
  throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn(...args);
      }
    };
  }
};

// ==========================================
// Motion Utilities
// ==========================================

const Motion = {
  prefersReduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  stagger(elements, delay = 60, className = 'reveal-in', baseClass = 'row-reveal') {
    if (this.prefersReduced) {
      elements.forEach(el => el.classList.add(className));
      return;
    }
    elements.forEach((el, i) => {
      if (baseClass) el.classList.add(baseClass);
      setTimeout(() => el.classList.add(className), delay * i);
    });
  },

  pulse(el, className = 'chart-animate', duration = 600) {
    if (!el) return;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }
};

// ==========================================
// Notification System
// ==========================================

const Toast = {
  container: null,
  
  init() {
    this.container = DOM.$('#toast-container');
    if (!this.container) {
      this.container = DOM.create('div', { id: 'toast-container', className: 'toast-container' });
      document.body.appendChild(this.container);
    }
  },
  
  show(message, type = 'info', duration = 5000) {
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
    
    const toast = DOM.create('div', {
      className: `toast ${type}`,
      role: 'alert'
    }, [
      DOM.create('span', { className: 'toast-icon' }, [icons[type]]),
      DOM.create('span', { className: 'toast-message' }, [message])
    ]);
    
    this.container.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// ==========================================
// Loading State Manager
// ==========================================

const LoadingManager = {
  overlay: null,
  progressBar: null,
  statusText: null,
  detailText: null,
  phaseList: null,
  phaseTimer: null,
  progressTimer: null,
  
  init() {
    this.overlay = DOM.$('#loading-overlay');
    this.progressBar = DOM.$('#loading-bar');
    this.statusText = DOM.$('#loading-status');
    this.detailText = DOM.$('#loading-detail');
    this.phaseList = DOM.$('#loading-phases');
  },
  
  show(status = 'Initializing...') {
    this.overlay.classList.remove('hidden');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.overlay.classList.add('scan-active');
    this.statusText.textContent = status;
    this.updateProgress(0);
    this.startRitual();
  },
  
  hide() {
    this.overlay.classList.add('hidden');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.classList.remove('scan-active');
    this.stopRitual();
  },
  
  updateProgress(percent) {
    this.progressBar.style.width = `${percent}%`;
  },
  
  updateStatus(status, detail) {
    this.statusText.textContent = status;
    if (detail) this.detailText.textContent = detail;
  },

  startRitual() {
    if (Motion.prefersReduced) return;
    this.stopRitual();

    const phases = [
      { label: 'Schema validation', detail: 'Verifying required columns' },
      { label: 'Feature synthesis', detail: 'Deriving behavioral signals' },
      { label: 'Model scoring', detail: 'Calculating risk probabilities' },
      { label: 'Insight assembly', detail: 'Preparing dashboard outputs' }
    ];

    if (this.phaseList) {
      this.phaseList.innerHTML = phases.map((p, i) => (
        `<div class="loading-phase${i === 0 ? ' active' : ''}">${p.label}</div>`
      )).join('');
    }

    let phaseIndex = 0;
    this.phaseTimer = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % phases.length;
      const phase = phases[phaseIndex];
      this.updateStatus(phase.label, phase.detail);
      if (this.phaseList) {
        const items = Array.from(this.phaseList.querySelectorAll('.loading-phase'));
        items.forEach((el, idx) => el.classList.toggle('active', idx === phaseIndex));
      }
    }, 1400);

    let progress = 0;
    this.progressTimer = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8 + 4, 95);
      this.updateProgress(progress);
    }, 800);
  },

  stopRitual() {
    if (this.phaseTimer) clearInterval(this.phaseTimer);
    if (this.progressTimer) clearInterval(this.progressTimer);
    this.phaseTimer = null;
    this.progressTimer = null;
  }
};

// ==========================================
// Table Manager with Sorting & Pagination
// ==========================================

class DataTable {
  constructor(tableId, options = {}) {
    this.table = DOM.$(`#${tableId}`);
    this.tbody = this.table?.querySelector('tbody');
    this.thead = this.table?.querySelector('thead');
    this.data = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.pageSize = options.pageSize || 25;
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.onRowClick = options.onRowClick || null;
    
    this.init();
  }
  
  init() {
    if (!this.table) return;
    
    // Header sorting
    this.thead?.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
      th.style.cursor = 'pointer';
    });
    
    // Search
    if (this.table.dataset.searchable) {
      const searchInput = DOM.$(`#${this.table.id}-search`);
      searchInput?.addEventListener('input', DOM.debounce((e) => {
        this.search(e.target.value);
      }, 300));
    }
  }
  
  setData(data) {
    this.data = [...data];
    this.filteredData = [...data];
    this.render();
    this.updatePagination();
  }
  
  search(query) {
    const lower = query.toLowerCase();
    this.filteredData = this.data.filter(row => 
      Object.values(row).some(val => 
        String(val).toLowerCase().includes(lower)
      )
    );
    this.currentPage = 1;
    this.render();
    this.updatePagination();
  }
  
  filter(predicate) {
    this.filteredData = this.data.filter(predicate);
    this.currentPage = 1;
    this.render();
    this.updatePagination();
  }
  
  handleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    
    // Update UI indicators
    this.thead?.querySelectorAll('th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === column) {
        th.classList.add(`sort-${this.sortDirection}`);
      }
    });
    
    this.filteredData.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    this.render();
  }
  
  render() {
    if (!this.tbody) return;
    
    const start = (this.currentPage - 1) * this.pageSize;
    const pageData = this.filteredData.slice(start, start + this.pageSize);
    
    const fragment = document.createDocumentFragment();
    
    pageData.forEach((row, idx) => {
      const tr = this.createRow(row, start + idx);
      fragment.appendChild(tr);
    });
    
    this.tbody.innerHTML = '';
    this.tbody.appendChild(fragment);

    if (this.table?.classList.contains('animate-rows')) {
      const rows = Array.from(this.tbody.querySelectorAll('tr'));
      Motion.stagger(rows, 30, 'reveal-in', 'row-reveal');
    }
    
    // Update info text
    const infoEl = DOM.$(`#${this.table.id.replace('-table', '')}-table-info`);
    if (infoEl) {
      if (this.filteredData.length === 0) {
        infoEl.textContent = 'Showing 0 of 0';
      } else {
        infoEl.textContent = `Showing ${start + 1}-${Math.min(start + this.pageSize, this.filteredData.length)} of ${this.filteredData.length}`;
      }
    }
  }
  
  createRow(row, idx) {
    const tr = DOM.create('tr', { 'data-index': idx });
    
    // Override in subclasses or use formatter
    const cells = Object.values(row).map(val => {
      const td = DOM.create('td');
      td.textContent = val;
      return td;
    });
    
    cells.forEach(cell => tr.appendChild(cell));
    
    if (this.onRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => this.onRowClick(row, tr));
    }
    
    return tr;
  }
  
  updatePagination() {
    const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
    const container = DOM.$(`#${this.table.id.replace('-table', '')}-pagination`);
    if (!container || totalPages <= 1) return;
    
    const fragment = document.createDocumentFragment();
    
    // Prev button
    const prevBtn = DOM.create('button', {
      disabled: this.currentPage === 1,
      onclick: () => { this.currentPage--; this.render(); this.updatePagination(); }
    }, ['←']);
    fragment.appendChild(prevBtn);
    
    // Page buttons
    const maxButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    if (startPage > 1) {
      fragment.appendChild(DOM.create('button', { onclick: () => { this.currentPage = 1; this.render(); this.updatePagination(); } }, ['1']));
      if (startPage > 2) fragment.appendChild(DOM.create('span', {}, ['...']));
    }
    
    for (let i = startPage; i <= endPage; i++) {
      const btn = DOM.create('button', {
        className: i === this.currentPage ? 'active' : '',
        onclick: () => { this.currentPage = i; this.render(); this.updatePagination(); }
      }, [String(i)]);
      fragment.appendChild(btn);
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) fragment.appendChild(DOM.create('span', {}, ['...']));
      fragment.appendChild(DOM.create('button', { onclick: () => { this.currentPage = totalPages; this.render(); this.updatePagination(); } }, [String(totalPages)]));
    }
    
    // Next button
    const nextBtn = DOM.create('button', {
      disabled: this.currentPage === totalPages,
      onclick: () => { this.currentPage++; this.render(); this.updatePagination(); }
    }, ['→']);
    fragment.appendChild(nextBtn);
    
    container.innerHTML = '';
    container.appendChild(fragment);
  }
}

// ==========================================
// Specialized Tables
// ==========================================

class TransactionTable extends DataTable {
  createRow(tx) {
    const tr = DOM.create('tr');
    const riskLevel = this.computeRiskLevel(tx.fraud_score);
    
    const cells = [
      DOM.create('td', {}, [
        DOM.create('button', {
          className: 'user-link',
          onclick: () => Dashboard.openUserDrawer(tx.user_id)
        }, [tx.user_id])
      ]),
      DOM.create('td', {}, [this.formatDate(tx.timestamp)]),
      DOM.create('td', { className: 'numeric' }, [this.formatCurrency(tx.amount)]),
      DOM.create('td', {}, [tx.category]),
      DOM.create('td', {}, [tx.merchant]),
      DOM.create('td', {}, [tx.country]),
      DOM.create('td', { className: 'numeric' }, [(tx.fraud_score || 0).toFixed(2)]),
      DOM.create('td', {}, [
        DOM.create('span', {
          className: `risk-badge ${riskLevel.class}`,
          title: `Score ${(tx.fraud_score || 0).toFixed(2)} • Signals: ${tx.rule_based_fraud_flag ? 'Rules' : ''}${tx.model_fraud_flag ? ' Model' : ''}${tx.velocity_flag ? ' Velocity' : ''}`.trim()
        }, [riskLevel.label])
      ])
    ];
    
    cells.forEach(cell => tr.appendChild(cell));
    return tr;
  }
  
  computeRiskLevel(score) {
    const val = parseFloat(score) || 0;
    if (val > 0.75) return { label: 'High', class: 'risk-high' };
    if (val > 0.4) return { label: 'Medium', class: 'risk-medium' };
    return { label: 'Low', class: 'risk-low' };
  }
  
  formatDate(ts) {
    if (!ts) return '—';
    const date = new Date(ts);
    return date.toLocaleString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }
}

class FraudTable extends DataTable {
  createRow(tx) {
    const tr = DOM.create('tr');
    const riskLevel = this.computeRiskLevel(tx.fraud_score);
    const signals = [
      tx.rule_based_fraud_flag ? 'Rules' : null,
      tx.model_fraud_flag ? 'ML Model' : null,
      tx.velocity_flag ? 'Velocity' : null
    ].filter(Boolean).join(' + ') || 'None';
    
    const cells = [
      DOM.create('td', {}, [
        DOM.create('button', {
          className: 'user-link',
          onclick: () => Dashboard.openUserDrawer(tx.user_id)
        }, [tx.user_id])
      ]),
      DOM.create('td', { className: 'numeric' }, [this.formatCurrency(tx.amount)]),
      DOM.create('td', {}, [tx.country]),
      DOM.create('td', { className: 'numeric' }, [(tx.fraud_score || 0).toFixed(2)]),
      DOM.create('td', {}, [signals]),
      DOM.create('td', {}, [
        DOM.create('span', {
          className: `risk-badge ${riskLevel.class}${riskLevel.class === 'risk-high' ? ' risk-pulse' : ''}`,
          title: `Score ${(tx.fraud_score || 0).toFixed(2)} • ${signals}`
        }, [riskLevel.label])
      ]),
      DOM.create('td', {}, [
        DOM.create('button', {
          className: 'icon-btn btn-sm',
          onclick: () => this.showDetails(tx),
          'aria-label': 'View details'
        }, ['👁'])
      ])
    ];
    
    cells.forEach(cell => tr.appendChild(cell));
    return tr;
  }
  
  computeRiskLevel(score) {
    const val = parseFloat(score) || 0;
    if (val > 0.75) return { label: 'Critical', class: 'risk-high' };
    if (val > 0.4) return { label: 'Warning', class: 'risk-medium' };
    return { label: 'Low', class: 'risk-low' };
  }
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  }
  
  showDetails(tx) {
    const modal = DOM.$('#detail-modal');
    const body = DOM.$('#modal-body');
    
    body.innerHTML = `
      <div class="tx-detail">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Transaction ID</span>
            <span class="detail-value">${tx.id || 'N/A'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">User ID</span>
            <span class="detail-value">${tx.user_id}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Amount</span>
            <span class="detail-value">${this.formatCurrency(tx.amount)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Risk Score</span>
            <span class="detail-value" style="color: ${tx.fraud_score > 0.75 ? 'var(--risk-high)' : 'inherit'}">
              ${(tx.fraud_score || 0).toFixed(3)}
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Timestamp</span>
            <span class="detail-value">${tx.timestamp}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Merchant</span>
            <span class="detail-value">${tx.merchant}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Category</span>
            <span class="detail-value">${tx.category}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Country</span>
            <span class="detail-value">${tx.country}</span>
          </div>
        </div>
        <div class="detail-flags">
          <h4>Detection Flags</h4>
          <ul>
            ${tx.rule_based_fraud_flag ? '<li class="flag">⚠️ Rule-based anomaly detected</li>' : ''}
            ${tx.model_fraud_flag ? '<li class="flag">🤖 ML model flagged</li>' : ''}
            ${tx.velocity_flag ? '<li class="flag">⚡ Velocity threshold exceeded</li>' : ''}
          </ul>
        </div>
        <div class="case-timeline">
          <h4>Case Review Timeline</h4>
          <div class="timeline">
            <div class="timeline-step active">
              <span class="dot"></span>
              <div>
                <p class="step-title">Detection</p>
                <p class="step-desc">Anomaly identified by KAVACH signals.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="dot"></span>
              <div>
                <p class="step-title">Analyst Review</p>
                <p class="step-desc">Validate evidence and transaction context.</p>
              </div>
            </div>
            <div class="timeline-step">
              <span class="dot"></span>
              <div>
                <p class="step-title">Action</p>
                <p class="step-desc">Approve, flag, or escalate investigation.</p>
              </div>
            </div>
          </div>
          <div class="case-actions">
            <button class="primary-btn btn-sm">Open Case</button>
            <button class="ghost-btn btn-sm">Add Note</button>
          </div>
        </div>
      </div>
    `;
    
    modal.showModal();
    Dashboard.renderExplainability(tx);
    CaseManager.bindActions(tx);
  }
}

// ==========================================
// Chart Manager
// ==========================================

const ChartManager = {
  instances: {},

  themePalette() {
    const theme = document.body.getAttribute('data-theme') || 'kavach';
    if (theme === 'solar-copper') {
      return {
        primary: '#ff9f1c',
        secondary: '#c36f09',
        accent: '#f6b26b',
        riskHigh: '#ff6b35',
        riskMed: '#f4a261',
        riskLow: '#e0a96d'
      };
    }
    if (theme === 'aurora-core') {
      return {
        primary: '#4fd1ff',
        secondary: '#7c9cff',
        accent: '#79f2c0',
        riskHigh: '#ff6ad5',
        riskMed: '#7c9cff',
        riskLow: '#79f2c0'
      };
    }
    if (theme === 'sweet-dark') {
      return {
        primary: '#ec4899',
        secondary: '#7c3aed',
        accent: '#f59e0b',
        riskHigh: '#f43f5e',
        riskMed: '#fbbf24',
        riskLow: '#22c55e'
      };
    }
    if (theme === 'dreamy') {
      return {
        primary: '#c49362',
        secondary: '#8b5a3c',
        accent: '#b07a4f',
        riskHigh: '#9b4a32',
        riskMed: '#c07a4a',
        riskLow: '#8a6a54'
      };
    }
    return {
      primary: '#2dd4bf',
      secondary: '#38bdf8',
      accent: '#fbbf24',
      riskHigh: '#f43f5e',
      riskMed: '#fbbf24',
      riskLow: '#22c55e'
    };
  },
  pulseCanvas(canvasId) {
    const canvas = DOM.$(`#${canvasId}`);
    const wrapper = canvas?.closest('.chart-wrapper');
    Motion.pulse(wrapper, 'chart-animate', 650);
  },

  pulseContainer(containerId) {
    const container = DOM.$(`#${containerId}`);
    Motion.pulse(container, 'chart-animate', 650);
  },
  
  createCategoryChart(canvasId, data, type = 'doughnut') {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;

    const palette = this.themePalette();
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }

    const gradient1 = ctx.createLinearGradient(0, 0, 200, 200);
    gradient1.addColorStop(0, palette.primary);
    gradient1.addColorStop(1, palette.secondary);

    const gradient2 = ctx.createLinearGradient(0, 0, 200, 200);
    gradient2.addColorStop(0, palette.accent);
    gradient2.addColorStop(1, palette.riskHigh);
    
    this.instances[canvasId] = new Chart(ctx, {
      type: type,
      data: {
        labels: data.labels || [],
        datasets: [{
          data: data.values || [],
          backgroundColor: [gradient1, gradient2, palette.secondary, palette.riskLow, palette.riskHigh],
          borderColor: 'rgba(12, 18, 36, 0.9)',
          borderWidth: 2,
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: type === 'doughnut' ? '65%' : 0,
        animation: {
          animateRotate: true,
          duration: 1000
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#e5e7eb',
              usePointStyle: true,
              padding: 20,
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((value / total) * 100).toFixed(1);
                return `${label}: ${pct}% (${value})`;
              }
            }
          }
        }
      }
    });
    
    this.pulseCanvas(canvasId);
    
    return this.instances[canvasId];
  },
  
  createTrendChart(canvasId, data) {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;

    const palette = this.themePalette();
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, `${palette.riskLow}55`);
    gradient.addColorStop(1, `${palette.riskLow}00`);
    
    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Transaction Volume',
          data: data.map(d => d.total_spend),
          borderColor: palette.riskLow,
          backgroundColor: gradient,
          borderWidth: 3,
          tension: 0.4,
          fill: true,
          pointBackgroundColor: palette.riskLow,
          pointBorderColor: '#0b1020',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: {
          x: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: { color: '#9ca3af' }
          },
          y: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: {
              color: '#9ca3af',
              callback: (val) => '₹' + (val / 1000).toFixed(0) + 'K'
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(148, 163, 184, 0.3)',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Amount: ${new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR'
              }).format(ctx.parsed.y)}`
            }
          }
        }
      }
    });
    
    this.pulseCanvas(canvasId);
    
    return this.instances[canvasId];
  },

  createVelocityChart(canvasId, transactions) {
    const ctx = DOM.$(`#${canvasId}`)?.getContext('2d');
    if (!ctx) return;

    const palette = this.themePalette();
    if (this.instances[canvasId]) {
      this.instances[canvasId].destroy();
    }

    const byDay = new Map();
    transactions.forEach(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      if (!ts || Number.isNaN(ts.getTime())) return;
      const key = ts.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) || 0) + 1);
    });

    const labels = Array.from(byDay.keys()).sort();
    const counts = labels.map(l => byDay.get(l));

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, `${palette.primary}55`);
    gradient.addColorStop(1, `${palette.primary}00`);

    this.instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Transactions / day',
          data: counts,
          borderColor: palette.primary,
          backgroundColor: gradient,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            titleColor: '#e5e7eb',
            bodyColor: '#94a3b8'
          }
        },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.3)' } },
          y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55, 65, 81, 0.3)' } }
        }
      }
    });

    this.pulseCanvas(canvasId);
    return this.instances[canvasId];
  },
  
  createPlotly3D(containerId, transactions) {
    const container = DOM.$(`#${containerId}`);
    if (!container || typeof Plotly === 'undefined') return;

    const palette = this.themePalette();
    const points = transactions.slice(0, 300);
    if (points.length === 0) return;
    
    const trace = {
      x: points.map(p => parseFloat(p.amount) || 0),
      y: points.map(p => parseFloat(p.fraud_score) || 0),
      z: points.map((_, i) => i),
      mode: 'markers',
      type: 'scatter3d',
      marker: {
        size: 5,
        color: points.map(p => parseFloat(p.fraud_score) || 0),
        colorscale: [[0, palette.riskLow], [0.5, palette.riskMed], [1, palette.riskHigh]],
        opacity: 0.8,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 }
      },
      hovertemplate: `
        <b>User:</b> %{text}<br>
        <b>Amount:</b> ₹%{x:,.2f}<br>
        <b>Risk Score:</b> %{y:.3f}<br>
        <extra></extra>
      `,
      text: points.map(p => p.user_id)
    };
    
    const layout = {
      margin: { l: 0, r: 0, b: 0, t: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      scene: {
        xaxis: { 
          title: 'Amount (₹)', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        yaxis: { 
          title: 'Risk Score', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        zaxis: { 
          title: 'Index', 
          color: '#94a3b8',
          gridcolor: 'rgba(148, 163, 184, 0.2)'
        },
        bgcolor: 'rgba(0,0,0,0)',
        camera: {
          eye: { x: 1.5, y: 1.5, z: 1.2 }
        }
      },
      hoverlabel: {
        bgcolor: 'rgba(12, 18, 36, 0.95)',
        bordercolor: 'rgba(148, 163, 184, 0.3)',
        font: { color: '#e5e7eb' }
      }
    };
    
    Plotly.newPlot(container, [trace], layout, {
      displayModeBar: false,
      responsive: true
    });

    this.pulseContainer(containerId);
  },

  createGeoMap(containerId, transactions) {
    const container = DOM.$(`#${containerId}`);
    if (!container || typeof Plotly === 'undefined') return;

    const palette = this.themePalette();
    const byCountry = new Map();
    transactions.forEach(tx => {
      const country = tx.country || 'Unknown';
      const entry = byCountry.get(country) || { count: 0, risk: 0 };
      entry.count += 1;
      entry.risk += parseFloat(tx.fraud_score || 0);
      byCountry.set(country, entry);
    });

    const countries = Array.from(byCountry.keys());
    const counts = countries.map(c => byCountry.get(c).count);
    const risks = countries.map(c => {
      const entry = byCountry.get(c);
      return entry.count ? entry.risk / entry.count : 0;
    });

    const trace = {
      type: 'scattergeo',
      locationmode: 'country names',
      locations: countries,
      text: countries.map((c, i) => `${c}<br>Tx: ${counts[i]}<br>Risk: ${risks[i].toFixed(2)}`),
      marker: {
        size: counts.map(v => Math.max(6, Math.min(20, v))),
        color: risks,
        colorscale: [[0, palette.riskLow], [0.5, palette.riskMed], [1, palette.riskHigh]],
        opacity: 0.85,
        line: { color: 'rgba(0,0,0,0.3)', width: 1 }
      }
    };

    const layout = {
      margin: { l: 0, r: 0, b: 0, t: 0 },
      geo: {
        bgcolor: 'rgba(0,0,0,0)',
        showland: true,
        landcolor: 'rgba(15, 23, 42, 0.9)',
        showcountries: true,
        countrycolor: 'rgba(148, 163, 184, 0.2)',
        showocean: true,
        oceancolor: 'rgba(2, 6, 23, 0.9)',
        projection: { type: 'natural earth' }
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)'
    };

    Plotly.newPlot(container, [trace], layout, {
      displayModeBar: false,
      responsive: true
    });

    this.pulseContainer(containerId);
  },
  
  destroy(id) {
    if (this.instances[id]) {
      this.instances[id].destroy();
      delete this.instances[id];
    }
  }
};

// ==========================================
// Theme Manager
// ==========================================

const ThemeManager = {
  key: 'kavach_theme',
  valid: new Set(['aurora-core', 'sweet-dark', 'dreamy', 'solar-copper']),

  init() {
    const saved = localStorage.getItem(this.key) || 'aurora-core';
    this.applyTheme(saved);
    const select = DOM.$('#theme-select');
    if (select) select.value = localStorage.getItem(this.key) || 'aurora-core';
  },

  applyTheme(theme) {
    const selected = this.valid.has(theme) ? theme : 'aurora-core';
    document.body.setAttribute('data-theme', selected);
    localStorage.setItem(this.key, selected);
  }
};

// ==========================================
// Case Manager
// ==========================================

const CaseManager = {
  storageKey: 'kavach_cases',
  cases: [],

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      this.cases = raw ? JSON.parse(raw) : [];
    } catch {
      this.cases = [];
    }
  },

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.cases));
  },

  addCase(tx) {
    if (!tx || !tx.id) return;
    const exists = this.cases.find(c => c.id === tx.id);
    if (exists) {
      Toast.show('Case already exists for this transaction', 'info');
      return;
    }
    const newCase = {
      id: tx.id,
      user_id: tx.user_id || 'Unknown',
      amount: tx.amount || 0,
      country: tx.country || 'Unknown',
      fraud_score: tx.fraud_score || 0,
      status: 'open',
      history: [
        { at: new Date().toISOString(), label: 'Case created' }
      ],
      created_at: new Date().toISOString()
    };
    this.cases.unshift(newCase);
    this.save();
    this.render();
    Toast.show('Case opened', 'success');
  },

  updateStatus(id, status) {
    const item = this.cases.find(c => c.id === id);
    if (!item) return;
    item.status = status;
    item.history = item.history || [];
    item.history.unshift({ at: new Date().toISOString(), label: `Status set to ${status}` });
    this.save();
    this.render();
  },

  clearAll() {
    this.cases = [];
    this.save();
    this.render();
  },

  render() {
    const container = DOM.$('#case-list');
    if (!container) return;
    if (!this.cases.length) {
      container.innerHTML = '<p class="analysis-subtitle">No cases yet. Open a case from a flagged transaction.</p>';
      return;
    }

    container.innerHTML = this.cases.map(c => `
      <div class="case-item">
        <div>
          <div class="case-id">Case #${c.id}</div>
          <div>${c.user_id}</div>
        </div>
        <div>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(c.amount || 0)}</div>
        <div>${c.country}</div>
        <div class="case-status ${c.status}">${c.status}</div>
        <div>
          <select data-case="${c.id}" class="case-status-select">
            <option value="open" ${c.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="review" ${c.status === 'review' ? 'selected' : ''}>Review</option>
            <option value="escalated" ${c.status === 'escalated' ? 'selected' : ''}>Escalated</option>
            <option value="closed" ${c.status === 'closed' ? 'selected' : ''}>Closed</option>
          </select>
        </div>
        <div class="case-log">
          ${(c.history || []).slice(0, 2).map(h => `<span>${new Date(h.at).toLocaleString()}: ${h.label}</span>`).join('')}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.case-status-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const id = parseInt(e.target.getAttribute('data-case'), 10);
        this.updateStatus(id, e.target.value);
      });
    });
  },

  bindActions(tx) {
    const openBtn = DOM.$('.case-actions .primary-btn');
    if (openBtn) {
      openBtn.onclick = () => this.addCase(tx);
    }
  }
};

// ==========================================
// AI Chat Manager
// ==========================================

const AIChat = {
  log: null,
  form: null,
  input: null,
  isTyping: false,
  
  init() {
    this.log = DOM.$('#ai-chat-log');
    this.form = DOM.$('#ai-form');
    this.input = DOM.$('#ai-input');
    
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this.input) {
        e.preventDefault();
        this.input?.focus();
      }
      if (e.key === 'Escape') {
        this.input?.blur();
      }
    });
    
    // Suggested questions
    this.log?.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-suggestion')) {
        this.input.value = e.target.textContent;
        this.form.dispatchEvent(new Event('submit'));
      }
    });
    
    DOM.$('#ai-clear')?.addEventListener('click', () => this.clear());
  },
  
  handleSubmit(e) {
    e.preventDefault();
    if (this.isTyping) return;
    
    const question = this.input.value.trim();
    if (!question) return;
    
    this.addUserMessage(question);
    this.input.value = '';
    this.showTyping();
    
    fetch('/ask_ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    })
    .then(res => res.json())
    .then(data => {
      this.hideTyping();
      this.typeMessage(data.answer || 'I could not generate a response.');
    })
    .catch(err => {
      this.hideTyping();
      this.addAIMessage('I encountered an error. Please try again.');
      console.error('AI Error:', err);
    });
  },
  
  addUserMessage(text) {
    const msg = DOM.create('div', { className: 'user-message' }, [
      DOM.create('div', { className: 'user-label' }, ['You']),
      DOM.create('p', {}, [text])
    ]);
    this.log.appendChild(msg);
    this.scrollToBottom();
  },
  
  addAIMessage(text) {
    const msg = DOM.create('div', { className: 'ai-message ai-reveal' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('p', { className: 'ai-stagger' }, [text])
      ])
    ]);
    this.log.appendChild(msg);
    this.scrollToBottom();
  },
  
  showTyping() {
    this.isTyping = true;
    const typing = DOM.create('div', { className: 'ai-message typing', id: 'typing-indicator' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('div', { className: 'typing-dots' }, [
          DOM.create('span'),
          DOM.create('span'),
          DOM.create('span')
        ])
      ])
    ]);
    this.log.appendChild(typing);
    this.scrollToBottom();
  },
  
  hideTyping() {
    this.isTyping = false;
    DOM.$('#typing-indicator')?.remove();
  },
  
  typeMessage(text) {
    const msg = DOM.create('div', { className: 'ai-message ai-reveal' }, [
      DOM.create('div', { className: 'ai-avatar-sm' }),
      DOM.create('div', { className: 'message-content' }, [
        DOM.create('div', { className: 'ai-label' }, ['KAVACH AI']),
        DOM.create('p', { id: 'typing-text' })
      ])
    ]);
    this.log.appendChild(msg);
    
    const el = msg.querySelector('#typing-text');
    let i = 0;
    const speed = 15; // ms per char
    
    const type = () => {
      if (i < text.length) {
        el.textContent += text.charAt(i);
        i++;
        this.scrollToBottom();
        setTimeout(type, speed);
      } else {
        el.classList.add('ai-stagger');
      }
    };
    
    type();
  },
  
  scrollToBottom() {
    this.log.scrollTop = this.log.scrollHeight;
  },
  
  clear() {
    this.log.innerHTML = `
      <div class="ai-message system">
        <div class="ai-avatar-sm"></div>
        <div class="message-content">
          <p>Chat cleared. How can I help you analyze your data?</p>
          <div class="suggested-questions">
            <button class="chip chip-suggestion">What are the top risk factors?</button>
            <button class="chip chip-suggestion">Show me unusual patterns</button>
            <button class="chip chip-suggestion">Explain this user's behavior</button>
          </div>
        </div>
      </div>
    `;
  }
};

// ==========================================
// Upload Manager with Drag & Drop
// ==========================================

const UploadManager = {
  dropZone: null,
  fileInput: null,
  form: null,
  preview: null,
  
  init() {
    this.dropZone = DOM.$('#drop-zone');
    this.fileInput = DOM.$('#file-input');
    this.form = DOM.$('#upload-form');
    this.preview = DOM.$('#file-preview');
    
    if (!this.dropZone) return;
    
    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.add('drag-over');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      this.dropZone.addEventListener(eventName, () => {
        this.dropZone.classList.remove('drag-over');
      });
    });
    
    this.dropZone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length) {
        this.fileInput.files = files;
        this.handleFileSelect(files[0]);
      }
    });
    
    this.fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length) {
        this.handleFileSelect(e.target.files[0]);
      }
    });
    
    DOM.$('.remove-file')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearFile();
    });
    
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));
  },
  
  handleFileSelect(file) {
    if (!this.validateFile(file)) return;
    
    DOM.$('#file-name').textContent = file.name;
    DOM.$('#file-size').textContent = this.formatFileSize(file.size);
    this.preview.hidden = false;
    this.dropZone.querySelector('.drop-zone-content').style.opacity = '0.3';
    
    // Validate Excel/CSV
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      Toast.show('Please upload a valid Excel or CSV file', 'error');
      this.clearFile();
      return;
    }
    
    Toast.show(`File "${file.name}" ready for analysis`, 'success');
  },
  
  validateFile(file) {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      Toast.show('File size exceeds 50MB limit', 'error');
      return false;
    }
    return true;
  },
  
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },
  
  clearFile() {
    this.fileInput.value = '';
    this.preview.hidden = true;
    this.dropZone.querySelector('.drop-zone-content').style.opacity = '1';
  },
  
  async handleSubmit(e) {
    e.preventDefault();
    
    const file = this.fileInput.files[0];
    if (!file) {
      Toast.show('Please select a file to analyze', 'error');
      return;
    }
    
    const btn = DOM.$('#analyze-btn');
    const btnText = btn.querySelector('.btn-text');
    const btnLoader = btn.querySelector('.btn-loader');
    
    btn.disabled = true;
    btnText.hidden = true;
    btnLoader.hidden = false;
    
    LoadingManager.show('Uploading file...');
    
    const formData = new FormData(this.form);
    
    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
        throw new Error(error.detail);
      }
      
      LoadingManager.updateStatus('Processing data...', 'Running ML models and rule engine');
      LoadingManager.updateProgress(50);
      
      // Simulate progress steps
      await new Promise(r => setTimeout(r, 500));
      LoadingManager.updateProgress(75);
      
      window.location.href = '/dashboard';
      
    } catch (error) {
      Toast.show(error.message, 'error');
      btn.disabled = false;
      btnText.hidden = false;
      btnLoader.hidden = true;
      LoadingManager.hide();
    }
  }
};

// ==========================================
// KPI Animation
// ==========================================

const KPIAnimation = {
  animateValue(element, start, end, duration, prefix = '', suffix = '') {
    const range = end - start;
    const minTimer = 50;
    let stepTime = Math.abs(Math.floor(duration / range));
    stepTime = Math.max(stepTime, minTimer);
    
    let startTime = new Date().getTime();
    let endTime = startTime + duration;
    let timer;
    
    const run = () => {
      let now = new Date().getTime();
      let remaining = Math.max((endTime - now) / duration, 0);
      let value = Math.round(end - (remaining * range));
      element.textContent = prefix + value.toLocaleString('en-IN') + suffix;
      if (value == end) {
        clearInterval(timer);
      }
    };
    
    timer = setInterval(run, stepTime);
    run();
  },
  
  animateCurrency(element, start, end, duration, currency = 'INR') {
    const formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    });
    
    const range = end - start;
    const durationMs = duration;
    const startTime = performance.now();
    
    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const current = start + (range * easeProgress);
      
      element.textContent = formatter.format(current);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  }
};

// ==========================================
// Main Dashboard Controller
// ==========================================

const Dashboard = {
  tables: {},
  orbitTimer: null,
  orbitAngle: 0,
  stats: {
    user: new Map(),
    country: new Map()
  },
  
  async init() {
    Toast.init();
    LoadingManager.init();
    UploadManager.init();
    AIChat.init();
    CaseManager.load();
    CaseManager.render();
    ThemeManager.init();
    
    // Initialize tables before data load so hydration can populate them.
    this.initTables();
    this.showSkeletons();
    this.applyAdvancedVisibility();
    
    // Check if we have data
    await this.loadData();
    
    // Event listeners
    this.bindEvents();
    
    // Scroll reveal
    this.initScrollReveal();
  },
  
  async loadData() {
    try {
      const response = await fetch('/dashboard_data');
      if (!response.ok) {
        if (response.status === 400) {
          // No data yet, show empty state
          this.hideSkeletons(true);
          return;
        }
        throw new Error('Failed to load dashboard data');
      }
      
      const data = await response.json();
      Store.set('transactions', data.transactions || []);
      Store.set('insights', data.insights || {});
      Store.set('categoryChart', data.category_chart || { labels: [], values: [] });
      Store.set('monthlyTrends', data.monthly_trends || []);
      Store.set('userProfile', data.user_profile || {});
      Store.set('sampleRows', data.sample_rows || []);
      
    this.hydrateDashboard(data);
      
    } catch (error) {
      console.error('Dashboard load error:', error);
      this.hideSkeletons(true);
      Toast.show('Failed to load dashboard data', 'error');
    }
  },
  
  hydrateDashboard(data) {
    const { insights, transactions, fraud_table, user_profile, sample_rows } = data;
    this.hideSkeletons();
    this.buildStats(transactions || []);
    this.updateEmptyCoach(transactions || []);

    const filtered = this.filterByTimeRange(transactions || []);
    
    // KPIs
    const totalSpend = (filtered || []).reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    const topCat = insights?.top_categories?.[0];
    let fraudRows = fraud_table || [];
    if (fraudRows.length === 0 && Array.isArray(filtered)) {
      fraudRows = filtered.filter(tx => tx.rule_based_fraud_flag || tx.model_fraud_flag);
    }
    const highRisk = fraudRows.filter(r => (r.fraud_score || 0) > 0.75).length;
    const medRisk = fraudRows.filter(r => {
      const s = r.fraud_score || 0;
      return s > 0.4 && s <= 0.75;
    }).length;

    const threshold = Store.get('ui.riskThreshold') || 0.6;
    const thresholdRows = (filtered || []).filter(tx => parseFloat(tx.fraud_score || 0) >= threshold);
    
    // Animate KPIs
    setTimeout(() => {
      const totalEl = DOM.$('#kpi-total-spend');
      if (totalEl) KPIAnimation.animateCurrency(totalEl, 0, totalSpend, 1500);
      
      const catEl = DOM.$('#kpi-top-category');
      if (catEl) catEl.textContent = topCat?.category || '—';
      
      const riskEl = DOM.$('#kpi-risk-count');
      if (riskEl) KPIAnimation.animateValue(riskEl, 0, thresholdRows.length, 1000);
      
      DOM.$('#kpi-tx-count').textContent = filtered?.length || 0;
      DOM.$('#high-risk-count').textContent = highRisk;
      DOM.$('#med-risk-count').textContent = medRisk;

      const topAnomaly = thresholdRows.sort((a, b) => (b.fraud_score || 0) - (a.fraud_score || 0))[0];
      const topEl = DOM.$('#kpi-top-anomaly');
      const topDetail = DOM.$('#kpi-top-anomaly-detail');
      if (topEl) topEl.textContent = topAnomaly ? `${topAnomaly.user_id}` : '—';
      if (topDetail) topDetail.textContent = topAnomaly
        ? `${this.formatCurrency(topAnomaly.amount)} • Score ${(topAnomaly.fraud_score || 0).toFixed(2)}`
        : '—';
      
      // Animate bars
      DOM.$('#kpi-bar-total').style.width = '75%';
      DOM.$('#kpi-bar-category').style.width = topCat ? '60%' : '0%';
      DOM.$('#kpi-bar-risk').style.width = Math.min(90, thresholdRows.length * 10) + '%';
    }, 300);

    const thresholdInput = DOM.$('#risk-global-threshold');
    const thresholdLabel = DOM.$('#risk-threshold-value');
    if (thresholdInput) thresholdInput.value = String(threshold);
    if (thresholdLabel) thresholdLabel.textContent = threshold.toFixed(2);
    
    // Update titles
    const name = user_profile?.name || 'you';
    const sheetType = user_profile?.sheet_type || 'this dataset';
    DOM.$('#analysis-title').textContent = `Analysis for ${name}`;
    DOM.$('#analysis-subtitle').textContent = `Dataset: ${sheetType}`;
    DOM.$('#tx-header').textContent = `Transactions: ${sheetType}`;
    DOM.$('#tx-subheader').textContent = `${filtered?.length || 0} records analyzed`;
    
    // Populate tables
    if (this.tables.transactions) {
      this.tables.transactions.setData(filtered || []);
    }
    if (this.tables.fraud) {
      this.tables.fraud.setData(thresholdRows);
    }
    this.tables.fraud?.filter(() => true);
    this.pulseRiskBadge(highRisk + medRisk);
    
    // Sample table
    this.renderSampleTable(sample_rows || []);
    
    // Charts
    this.initCharts({ ...data, transactions: filtered });
    this.initSimulator(filtered || []);
    this.initComparator(filtered || []);
    this.renderHeatmap(filtered || []);
    this.initPitchFeatures(filtered || []);
    
    // 3D Viz
    if (filtered?.length > 0) {
      setTimeout(() => {
        ChartManager.createPlotly3D('plotly-3d', filtered);
        this.togglePlotlyOrbit();
      }, 500);
    }
    
    // Cluster insights
    this.renderClusters(data.cluster_insights || []);
  },
  
  initTables() {
    this.tables.transactions = new TransactionTable('transactions-table', {
      pageSize: 25,
      searchable: true
    });
    
    this.tables.fraud = new FraudTable('fraud-table', {
      pageSize: 10
    });

    DOM.$('#fraud-table')?.classList.add('animate-rows');
    
    // Risk filter removed: always show all flagged transactions.
    
    // Search
    DOM.$('#tx-search')?.addEventListener('input', DOM.debounce((e) => {
      this.tables.transactions.search(e.target.value);
    }, 300));
  },

  updateEmptyCoach(transactions) {
    const coach = DOM.$('#empty-coach');
    if (!coach) return;
    coach.style.display = transactions.length ? 'none' : 'block';
  },

  filterByTimeRange(transactions) {
    const range = Store.get('ui.timeRange') || 'all';
    if (range === 'all') return transactions;
    const now = new Date();
    const days = parseInt(range.replace('d', ''), 10);
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return transactions.filter(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      return ts && !Number.isNaN(ts.getTime()) && ts >= cutoff;
    });
  },

  buildStats(transactions) {
    this.stats.user.clear();
    this.stats.country.clear();

    transactions.forEach(tx => {
      const userId = tx.user_id || 'Unknown';
      const user = this.stats.user.get(userId) || { count: 0, sum: 0, sumSq: 0, countries: new Map(), riskSum: 0 };
      const amount = parseFloat(tx.amount || 0);
      user.count += 1;
      user.sum += amount;
      user.sumSq += amount * amount;
      user.riskSum += parseFloat(tx.fraud_score || 0);
      const country = tx.country || 'Unknown';
      user.countries.set(country, (user.countries.get(country) || 0) + 1);
      this.stats.user.set(userId, user);

      const c = this.stats.country.get(country) || { count: 0, riskSum: 0 };
      c.count += 1;
      c.riskSum += parseFloat(tx.fraud_score || 0);
      this.stats.country.set(country, c);
    });
  },

  renderExplainability(tx) {
    const metrics = DOM.$('#explain-metrics');
    const chips = DOM.$('#explain-chips');
    const title = DOM.$('#explain-title');
    if (!metrics || !chips || !title || !tx) return;

    const userId = tx.user_id || 'Unknown';
    const user = this.stats.user.get(userId);
    const amount = parseFloat(tx.amount || 0);
    const fraudScore = parseFloat(tx.fraud_score || 0);

    let mean = 0;
    let std = 0;
    let avgRisk = 0;
    let commonCountry = 'Unknown';
    if (user) {
      mean = user.sum / user.count;
      const variance = Math.max((user.sumSq / user.count) - mean * mean, 0);
      std = Math.sqrt(variance);
      avgRisk = user.riskSum / user.count;
      let maxCount = 0;
      user.countries.forEach((count, country) => {
        if (count > maxCount) {
          maxCount = count;
          commonCountry = country;
        }
      });
    }

    const drivers = [];
    if (tx.velocity_flag) drivers.push('Velocity spike');
    if (tx.rule_based_fraud_flag) drivers.push('Rule-based anomaly');
    if (tx.model_fraud_flag) drivers.push('Model flagged');
    if (fraudScore > 0.75) drivers.push('High risk score');
    if (std > 0 && amount > mean + 2 * std) drivers.push('Unusually large amount');
    if (tx.country && commonCountry !== 'Unknown' && tx.country !== commonCountry) {
      drivers.push('Unusual country for user');
    }
    if (!drivers.length) drivers.push('No dominant driver detected');

    title.textContent = `Explainability for Transaction ${tx.id ?? 'N/A'}`;
    metrics.innerHTML = `
      <div class="explain-metric">
        <span class="label">User Avg Amount</span>
        <span class="value">${this.formatCurrency(mean)}</span>
      </div>
      <div class="explain-metric">
        <span class="label">Txn Amount</span>
        <span class="value">${this.formatCurrency(amount)}</span>
      </div>
      <div class="explain-metric">
        <span class="label">Risk Score</span>
        <span class="value">${fraudScore.toFixed(2)}</span>
      </div>
      <div class="explain-metric">
        <span class="label">User Avg Risk</span>
        <span class="value">${avgRisk.toFixed(2)}</span>
      </div>
    `;

    chips.innerHTML = drivers.map(d => `<span class="explain-chip">${d}</span>`).join('');
  },

  openUserDrawer(userId) {
    if (!userId) return;
    const drawer = DOM.$('#user-drawer');
    const backdrop = DOM.$('#drawer-backdrop');
    const title = DOM.$('#drawer-title');
    const body = DOM.$('#drawer-body');
    if (!drawer || !title || !body) return;

    const transactions = Store.get('transactions') || [];
    const subset = transactions.filter(tx => tx.user_id === userId);
    const total = subset.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    const avg = subset.length ? total / subset.length : 0;
    const avgRisk = subset.reduce((sum, tx) => sum + parseFloat(tx.fraud_score || 0), 0) / Math.max(subset.length, 1);
    const topMerchant = subset.reduce((acc, tx) => {
      const m = tx.merchant || 'Unknown';
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    }, {});
    const topMerchantName = Object.entries(topMerchant).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    title.textContent = `User 360 • ${userId}`;
    body.innerHTML = `
      <div class="drawer-card">
        <div class="detail-label">Total Spend</div>
        <div class="detail-value">${this.formatCurrency(total)}</div>
      </div>
      <div class="drawer-card">
        <div class="detail-label">Average Transaction</div>
        <div class="detail-value">${this.formatCurrency(avg)}</div>
      </div>
      <div class="drawer-card">
        <div class="detail-label">Average Risk</div>
        <div class="detail-value">${avgRisk.toFixed(2)}</div>
      </div>
      <div class="drawer-card">
        <div class="detail-label">Top Merchant</div>
        <div class="detail-value">${topMerchantName}</div>
      </div>
      <div class="drawer-card">
        <div class="detail-label">Transactions</div>
        <div class="detail-value">${subset.length}</div>
      </div>
    `;

    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) {
      backdrop.classList.add('active');
      backdrop.setAttribute('aria-hidden', 'false');
    }
  },

  renderHeatmap(transactions) {
    const container = DOM.$('#heatmap');
    if (!container || transactions.length === 0) return;

    const byCategory = new Map();
    const byCountry = new Map();

    transactions.forEach(tx => {
      const cat = tx.category || 'Unknown';
      const ctry = tx.country || 'Unknown';
      byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
      byCountry.set(ctry, (byCountry.get(ctry) || 0) + 1);
    });

    const topCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);
    const topCountries = Array.from(byCountry.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);

    const matrix = {};
    transactions.forEach(tx => {
      const cat = tx.category || 'Unknown';
      const ctry = tx.country || 'Unknown';
      if (!topCategories.includes(cat) || !topCountries.includes(ctry)) return;
      const key = `${cat}::${ctry}`;
      const entry = matrix[key] || { count: 0, riskSum: 0 };
      entry.count += 1;
      entry.riskSum += parseFloat(tx.fraud_score || 0);
      matrix[key] = entry;
    });

    const rows = [];
    rows.push(`
      <div class="heatmap-row">
        <div class="heatmap-cell heatmap-label">Category</div>
        ${topCountries.map(c => `<div class="heatmap-cell">${c}</div>`).join('')}
      </div>
    `);

    topCategories.forEach(cat => {
      const cells = topCountries.map(ctry => {
        const key = `${cat}::${ctry}`;
        const entry = matrix[key];
        const avgRisk = entry ? entry.riskSum / entry.count : 0;
        const intensity = Math.min(0.85, 0.15 + avgRisk);
        const bg = `rgba(244, 63, 94, ${intensity})`;
        return `<div class="heatmap-cell" style="background:${bg}">${avgRisk.toFixed(2)}</div>`;
      }).join('');

      rows.push(`
        <div class="heatmap-row">
          <div class="heatmap-cell heatmap-label">${cat}</div>
          ${cells}
        </div>
      `);
    });

    container.innerHTML = rows.join('');
  },

  initSimulator(transactions) {
    const slider = DOM.$('#risk-threshold');
    const thresholdEl = DOM.$('#sim-threshold');
    const flaggedEl = DOM.$('#sim-flagged');
    const rateEl = DOM.$('#sim-rate');
    if (!slider || !thresholdEl || !flaggedEl || !rateEl) return;

    const compute = () => {
      const threshold = parseFloat(slider.value);
      const flagged = transactions.filter(tx => parseFloat(tx.fraud_score || 0) >= threshold).length;
      const rate = transactions.length ? (flagged / transactions.length) * 100 : 0;
      thresholdEl.textContent = threshold.toFixed(2);
      flaggedEl.textContent = flagged.toString();
      rateEl.textContent = `${rate.toFixed(1)}%`;
    };

    slider.addEventListener('input', compute);
    compute();
  },

  initComparator(transactions) {
    const selectA = DOM.$('#compare-a');
    const selectB = DOM.$('#compare-b');
    const btn = DOM.$('#compare-run');
    const grid = DOM.$('#compare-grid');
    if (!selectA || !selectB || !btn || !grid) return;

    const users = Array.from(new Set(transactions.map(tx => tx.user_id))).filter(Boolean).slice(0, 50);
    selectA.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
    selectB.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
    if (users.length > 1) selectB.value = users[1];

    const summarize = (userId) => {
      const subset = transactions.filter(tx => tx.user_id === userId);
      const total = subset.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const avg = subset.length ? total / subset.length : 0;
      const risk = subset.reduce((sum, tx) => sum + parseFloat(tx.fraud_score || 0), 0) / Math.max(subset.length, 1);
      return { total, avg, count: subset.length, risk };
    };

    const render = () => {
      const a = summarize(selectA.value);
      const b = summarize(selectB.value);
      grid.innerHTML = `
        <div class="compare-card">
          <span class="label">Entity A Total</span>
          <div class="value">${this.formatCurrency(a.total)}</div>
        </div>
        <div class="compare-card">
          <span class="label">Entity B Total</span>
          <div class="value">${this.formatCurrency(b.total)}</div>
        </div>
        <div class="compare-card">
          <span class="label">Entity A Avg</span>
          <div class="value">${this.formatCurrency(a.avg)}</div>
        </div>
        <div class="compare-card">
          <span class="label">Entity B Avg</span>
          <div class="value">${this.formatCurrency(b.avg)}</div>
        </div>
        <div class="compare-card">
          <span class="label">Entity A Risk</span>
          <div class="value">${a.risk.toFixed(2)}</div>
        </div>
        <div class="compare-card">
          <span class="label">Entity B Risk</span>
          <div class="value">${b.risk.toFixed(2)}</div>
        </div>
      `;
    };

    btn.addEventListener('click', render);
    render();
  },

  initPitchFeatures(transactions) {
    this.renderCfoSnapshot(transactions);
    this.renderPersonas(transactions);
    this.bindMovieControls(transactions);
    this.bindCounterfactual(transactions);
    this.bindRedTeam();
  },

  renderCfoSnapshot(transactions) {
    const container = DOM.$('#cfo-snapshot');
    if (!container) return;
    const total = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
    const flagged = transactions.filter(tx => (tx.fraud_score || 0) >= (Store.get('ui.riskThreshold') || 0.6)).length;
    const avgRisk = transactions.reduce((sum, tx) => sum + parseFloat(tx.fraud_score || 0), 0) / Math.max(transactions.length, 1);
    const topCountry = this.topKey(transactions.map(tx => tx.country || 'Unknown'));
    const topCategory = this.topKey(transactions.map(tx => tx.category || 'Unknown'));

    container.innerHTML = `
      <div class="snapshot-card">
        <div class="snapshot-title">Total Exposure</div>
        <div class="snapshot-value">${this.formatCurrency(total)}</div>
      </div>
      <div class="snapshot-card">
        <div class="snapshot-title">Flagged Count</div>
        <div class="snapshot-value">${flagged}</div>
      </div>
      <div class="snapshot-card">
        <div class="snapshot-title">Average Risk</div>
        <div class="snapshot-value">${avgRisk.toFixed(2)}</div>
      </div>
      <div class="snapshot-card">
        <div class="snapshot-title">Top Country</div>
        <div class="snapshot-value">${topCountry}</div>
      </div>
      <div class="snapshot-card">
        <div class="snapshot-title">Top Category</div>
        <div class="snapshot-value">${topCategory}</div>
      </div>
    `;
  },

  renderPersonas(transactions) {
    const container = DOM.$('#persona-grid');
    if (!container) return;
    const byUser = new Map();
    transactions.forEach(tx => {
      const user = tx.user_id || 'Unknown';
      const entry = byUser.get(user) || { count: 0, sum: 0, risk: 0 };
      entry.count += 1;
      entry.sum += parseFloat(tx.amount || 0);
      entry.risk += parseFloat(tx.fraud_score || 0);
      byUser.set(user, entry);
    });

    const personas = [
      { name: 'High‑Velocity Spenders', test: u => u.count >= 10 },
      { name: 'High‑Risk Outliers', test: u => u.risk / Math.max(u.count, 1) > 0.7 },
      { name: 'Steady Regulars', test: u => u.count >= 5 && (u.risk / Math.max(u.count, 1)) < 0.3 }
    ];

    const stats = personas.map(p => {
      const users = Array.from(byUser.values()).filter(p.test);
      return { name: p.name, count: users.length };
    });

    container.innerHTML = stats.map(s => `
      <div class="persona-card">
        <div class="persona-name">${s.name}</div>
        <div class="analysis-subtitle">${s.count} users</div>
      </div>
    `).join('');
  },

  bindMovieControls(transactions) {
    const play = DOM.$('#movie-play');
    const pause = DOM.$('#movie-pause');
    const stage = DOM.$('#movie-stage');
    const progress = DOM.$('#movie-progress');
    if (!play || !pause || !stage || !progress) return;

    let index = 0;
    let timer = null;

    const steps = this.buildMovieSteps(transactions);
    const renderStep = () => {
      const step = steps[index];
      if (!step) return;
      stage.innerHTML = `<strong>${step.title}</strong><p>${step.body}</p>`;
      progress.textContent = `${Math.round((index + 1) / steps.length * 100)}%`;
      index = (index + 1) % steps.length;
    };

    play.onclick = () => {
      if (timer) return;
      renderStep();
      timer = setInterval(renderStep, 2000);
    };

    pause.onclick = () => {
      clearInterval(timer);
      timer = null;
    };
  },

  buildMovieSteps(transactions) {
    if (!transactions.length) {
      return [{ title: 'No data', body: 'Upload a file to replay anomalies.' }];
    }
    const top = transactions.sort((a, b) => (b.fraud_score || 0) - (a.fraud_score || 0)).slice(0, 3);
    return [
      { title: 'Scan started', body: `Analyzed ${transactions.length} transactions.` },
      ...top.map((t, i) => ({
        title: `Anomaly #${i + 1}`,
        body: `User ${t.user_id} • ${this.formatCurrency(t.amount)} • Score ${(t.fraud_score || 0).toFixed(2)}`
      })),
      { title: 'Action', body: 'Open cases for high‑risk events.' }
    ];
  },

  bindCounterfactual(transactions) {
    const toggle = DOM.$('#cf-country');
    const slider = DOM.$('#cf-amount');
    const output = DOM.$('#cf-output');
    if (!toggle || !slider || !output) return;

    const compute = () => {
      const reduceBy = parseFloat(slider.value) / 100;
      const ignoreCountry = toggle.checked;
      const threshold = Store.get('ui.riskThreshold') || 0.6;
      const estimated = transactions.filter(tx => {
        let score = parseFloat(tx.fraud_score || 0);
        if (ignoreCountry && tx.country_changed) score -= 0.1;
        const reducedAmount = parseFloat(tx.amount || 0) * (1 - reduceBy);
        if (reducedAmount < parseFloat(tx.amount || 0) * 0.7) score -= 0.05;
        return score >= threshold;
      }).length;
      output.textContent = `Estimated flagged count: ${estimated}`;
    };

    toggle.addEventListener('change', compute);
    slider.addEventListener('input', compute);
    compute();
  },

  bindRedTeam() {
    const v = DOM.$('#rt-velocity');
    const g = DOM.$('#rt-geo');
    const a = DOM.$('#rt-amount');
    const btn = DOM.$('#rt-evaluate');
    const result = DOM.$('#rt-result');
    if (!v || !g || !a || !btn || !result) return;

    btn.addEventListener('click', () => {
      const risk = (parseInt(v.value, 10) * 0.1) + (parseInt(g.value, 10) * 0.2) + (parseInt(a.value, 10) * 0.1);
      const status = risk > 2 ? 'Detected' : 'Likely to evade';
      result.textContent = `Risk engine result: ${status} (score ${risk.toFixed(2)})`;
    });
  },

  topKey(list) {
    const map = new Map();
    list.forEach(v => map.set(v, (map.get(v) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  },

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  },
  
  renderSampleTable(rows) {
    const table = DOM.$('#sample-table');
    if (!table || rows.length === 0) return;
    
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const columns = Object.keys(rows[0]);
    
    thead.innerHTML = `<tr>${columns.map(c => 
      `<th scope="col">${c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</th>`
    ).join('')}</tr>`;
    
    tbody.innerHTML = rows.map(row => 
      `<tr>${columns.map(c => `<td>${row[c] ?? '—'}</td>`).join('')}</tr>`
    ).join('');
  },

  showSkeletons() {
    this.setTableSkeleton('sample-table', 4, 5);
    this.setTableSkeleton('fraud-table', 6, 7);
    this.setTableSkeleton('transactions-table', 6, 8);

    DOM.$$('.chart-wrapper, .plotly-container, .geo-map-container').forEach(el => {
      el.classList.add('is-loading');
    });
  },

  hideSkeletons(keepEmpty = false) {
    DOM.$$('.chart-wrapper, .plotly-container, .geo-map-container').forEach(el => {
      el.classList.remove('is-loading');
    });
    this.clearTableSkeleton('sample-table', keepEmpty);
    this.clearTableSkeleton('fraud-table', keepEmpty);
    this.clearTableSkeleton('transactions-table', keepEmpty);
  },

  setTableSkeleton(tableId, rows, cols) {
    const table = DOM.$(`#${tableId}`);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const container = table.closest('.table-container');
    container?.classList.add('is-loading');

    const skeletonRows = Array.from({ length: rows }).map(() => {
      const cells = Array.from({ length: cols }).map(() => '<td><span class="skeleton"></span></td>').join('');
      return `<tr class="skeleton-row">${cells}</tr>`;
    }).join('');
    tbody.innerHTML = skeletonRows;
  },

  clearTableSkeleton(tableId, keepEmpty = false) {
    const table = DOM.$(`#${tableId}`);
    if (!table) return;
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const container = table.closest('.table-container');
    container?.classList.remove('is-loading');
    if (keepEmpty) {
      tbody.innerHTML = '';
      return;
    }
    const hasSkeletons = tbody.querySelector('.skeleton-row');
    if (hasSkeletons) tbody.innerHTML = '';
  },

  pulseRiskBadge(count) {
    const badge = DOM.$('#risk-badge');
    if (!badge) return;
    if (count > 0) {
      badge.hidden = false;
      badge.classList.add('risk-pulse');
    } else {
      badge.hidden = true;
      badge.classList.remove('risk-pulse');
    }
  },
  
  initCharts(data) {
    const catData = data.category_chart || { labels: [], values: [] };
    const monthlyData = data.monthly_trends || [];
    
    ChartManager.createCategoryChart('categoryChart', catData, 'doughnut');
    ChartManager.createTrendChart('monthlyChart', monthlyData);
    ChartManager.createVelocityChart('velocityChart', data.transactions || []);
    ChartManager.createGeoMap('geo-map', data.transactions || []);

    const countsByDay = new Map();
    (data.transactions || []).forEach(tx => {
      const ts = tx.timestamp ? new Date(tx.timestamp) : null;
      if (!ts || Number.isNaN(ts.getTime())) return;
      const key = ts.toISOString().slice(0, 10);
      countsByDay.set(key, (countsByDay.get(key) || 0) + 1);
    });
    const peak = Math.max(0, ...countsByDay.values());
    const velocityAlerts = (data.transactions || []).filter(tx => {
      return parseFloat(tx.fraud_score || 0) > 0.6;
    }).length;
    const peakEl = DOM.$('#peak-activity');
    const alertEl = DOM.$('#velocity-alerts');
    if (peakEl) peakEl.textContent = peak ? `${peak} tx/day` : '—';
    if (alertEl) alertEl.textContent = velocityAlerts ? String(velocityAlerts) : '—';
    
    // Chart type toggles
    DOM.$$('.chart-type').forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.$$('.chart-type').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ChartManager.createCategoryChart('categoryChart', catData, btn.dataset.type);
      });
    });
  },
  
  renderClusters(insights) {
    const panel = DOM.$('#cluster-panel');
    if (!panel) return;
    
    if (insights.length === 0) {
      panel.innerHTML = '<div class="cluster-empty"><p>No anomaly clusters detected in current dataset.</p></div>';
      return;
    }
    
    panel.innerHTML = insights.map(insight => `
      <div class="cluster-row">
        <span>${insight.name}</span>
        <span class="cluster-score">${insight.score.toFixed(2)}</span>
      </div>
    `).join('');
    
    // Key insights list
    const list = DOM.$('#insights-list');
    if (list) {
      const items = [
        `${insights.length} distinct anomaly patterns identified`,
        `Primary cluster: ${insights[0]?.name}`,
        `Average cluster confidence: ${(insights.reduce((a, b) => a + b.score, 0) / insights.length).toFixed(2)}`
      ];
      list.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    }
  },
  
  bindEvents() {
    // Export buttons
    DOM.$('#export-analysis')?.addEventListener('click', () => this.exportReport());
    DOM.$('#export-risk')?.addEventListener('click', () => this.exportFlaggedPdf());
    DOM.$('#export-all')?.addEventListener('click', () => this.exportTable('transactions'));
    DOM.$('#risk-global-threshold')?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      Store.set('ui.riskThreshold', val);
      const label = DOM.$('#risk-threshold-value');
      if (label) label.textContent = val.toFixed(2);
      this.hydrateDashboard({
        insights: Store.get('insights'),
        category_chart: Store.get('categoryChart'),
        monthly_trends: Store.get('monthlyTrends'),
        transactions: Store.get('transactions'),
        fraud_table: [],
        user_profile: Store.get('userProfile'),
        sample_rows: Store.get('sampleRows') || []
      });
    });

    DOM.$('#time-range-group')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.time-range');
      if (!btn) return;
      DOM.$$('#time-range-group .time-range').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Store.set('ui.timeRange', btn.dataset.range);
      this.hydrateDashboard({
        insights: Store.get('insights'),
        category_chart: Store.get('categoryChart'),
        monthly_trends: Store.get('monthlyTrends'),
        transactions: Store.get('transactions'),
        fraud_table: [],
        user_profile: Store.get('userProfile'),
        sample_rows: Store.get('sampleRows') || []
      });
    });
    DOM.$('#case-clear')?.addEventListener('click', () => {
      CaseManager.clearAll();
      Toast.show('Cases cleared', 'info');
    });
    
    // Refresh
    DOM.$('#refresh-data')?.addEventListener('click', () => {
      Toast.show('Refreshing data...', 'info');
      this.loadData();
    });
    
    // 3D controls
    DOM.$('#reset-viz')?.addEventListener('click', () => {
      const container = DOM.$('#plotly-3d');
      if (container && typeof Plotly !== 'undefined') {
        Plotly.relayout(container, {
          'scene.camera': {
            eye: { x: 1.5, y: 1.5, z: 1.2 }
          }
        });
      }
    });

    DOM.$('#auto-rotate')?.addEventListener('change', () => {
      this.togglePlotlyOrbit();
    });
    
    // Modal close
    DOM.$('.modal-close')?.addEventListener('click', () => {
      DOM.$('#detail-modal')?.close();
    });
    
    // Theme toggle (placeholder)
    DOM.$('#theme-select')?.addEventListener('change', (e) => {
      ThemeManager.applyTheme(e.target.value);
    });

    const closeDrawer = () => this.closeUserDrawer();
    DOM.$('#drawer-close')?.addEventListener('click', closeDrawer);
    DOM.$('#drawer-backdrop')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    DOM.$('#cfo-export')?.addEventListener('click', () => this.exportSnapshot());

    DOM.$('#toggle-advanced')?.addEventListener('click', () => {
      const current = Store.get('ui.showAdvanced');
      Store.set('ui.showAdvanced', !current);
      this.applyAdvancedVisibility();
    });
  },

  applyAdvancedVisibility() {
    const show = Store.get('ui.showAdvanced');
    document.body.classList.toggle('advanced-hidden', !show);
    const btn = DOM.$('#toggle-advanced');
    if (btn) btn.textContent = show ? 'Hide Advanced' : 'Show Advanced';
  },

  exportSnapshot() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      Toast.show('PDF library not loaded', 'error');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const container = DOM.$('#cfo-snapshot');
    const profile = Store.get('userProfile') || {};
    const analystName = profile.name || 'Analyst';
    const auditType = profile.sheet_type || 'Audit';

    // Watermark
    doc.setTextColor(80, 98, 120);
    doc.setFontSize(64);
    doc.setGState(new doc.GState({ opacity: 0.06 }));
    doc.text('KAVACH', doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, {
      align: 'center',
      angle: 25
    });
    doc.setGState(new doc.GState({ opacity: 1 }));

    // Header band
    doc.setFillColor(12, 18, 36);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 90, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(20);
    doc.text('KAVACH CFO Snapshot', 40, 50);
    doc.setFontSize(11);
    doc.text(`Analyst: ${analystName}`, 40, 70);
    doc.text(`Audit: ${auditType}`, 220, 70);

    // Body
    let y = 125;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    if (container) {
      container.querySelectorAll('.snapshot-card').forEach(card => {
        const title = card.querySelector('.snapshot-title')?.textContent || '';
        const value = card.querySelector('.snapshot-value')?.textContent || '';
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(40, y - 18, doc.internal.pageSize.getWidth() - 80, 34, 8, 8, 'F');
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(9);
        doc.text(title.toUpperCase(), 55, y - 2);
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(12);
        doc.text(value, 220, y - 2);
        y += 42;
      });
    }

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString();
    doc.text(`Generated: ${dateStr}`, 40, pageHeight - 30);
    doc.text('Confidential • KAVACH Risk Intelligence', doc.internal.pageSize.getWidth() - 260, pageHeight - 30);

    doc.save(`kavach-cfo-snapshot-${new Date().toISOString().split('T')[0]}.pdf`);
    Toast.show('Snapshot downloaded', 'success');
  },

  closeUserDrawer() {
    const drawer = DOM.$('#user-drawer');
    const backdrop = DOM.$('#drawer-backdrop');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('active');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  },

  togglePlotlyOrbit() {
    const toggle = DOM.$('#auto-rotate');
    if (!toggle || !toggle.checked) {
      this.stopPlotlyOrbit();
      return;
    }
    this.startPlotlyOrbit();
  },

  startPlotlyOrbit() {
    const container = DOM.$('#plotly-3d');
    if (!container || typeof Plotly === 'undefined') return;
    this.stopPlotlyOrbit();
    this.orbitAngle = 0;
    this.orbitTimer = setInterval(() => {
      this.orbitAngle += 0.02;
      const radius = 1.6;
      const x = radius * Math.cos(this.orbitAngle);
      const y = radius * Math.sin(this.orbitAngle);
      Plotly.relayout(container, {
        'scene.camera.eye': { x, y, z: 1.2 }
      });
    }, 80);
  },

  stopPlotlyOrbit() {
    if (this.orbitTimer) clearInterval(this.orbitTimer);
    this.orbitTimer = null;
  },
  
  exportReport() {
    const insights = Store.get('insights');
    const transactions = Store.get('transactions');
    if (!transactions || transactions.length === 0) {
      Toast.show('No data to export', 'error');
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      Toast.show('PDF library not loaded', 'error');
      return;
    }

    Toast.show('Generating PDF report...', 'info');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    const profile = Store.get('userProfile') || {};
    const analystName = profile.name || 'Analyst';
    const auditType = profile.sheet_type || 'Audit';

    doc.setFillColor(12, 18, 36);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 90, 'F');
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(20);
    doc.text('KAVACH Risk Intelligence Report', 40, 45);
    doc.setFontSize(11);
    doc.text(`Analyst: ${analystName}`, 40, 65);
    doc.text(`Audit: ${auditType}`, 240, 65);

    doc.setTextColor(20, 24, 38);
    doc.setFontSize(12);
    let y = 120;

    const totalSpend = insights?.total_spend || 0;
    const txCount = transactions.length;
    const avgRisk = transactions.reduce((sum, tx) => sum + parseFloat(tx.fraud_score || 0), 0) / Math.max(txCount, 1);

    doc.text(`Total Spend: ${this.formatCurrency(totalSpend)}`, 40, y);
    y += 18;
    doc.text(`Transactions: ${txCount}`, 40, y);
    y += 18;
    doc.text(`Average Risk Score: ${avgRisk.toFixed(2)}`, 40, y);
    y += 28;

    doc.setFontSize(11);
    doc.text('Top Categories (by spend):', 40, y);
    y += 16;
    (insights?.top_categories || []).slice(0, 5).forEach((cat) => {
      doc.text(`- ${cat.category}: ${this.formatCurrency(cat.total_spend)}`, 50, y);
      y += 14;
    });

    y += 10;
    doc.text('Monthly Trends:', 40, y);
    y += 16;
    (insights?.monthly_trends || []).slice(-6).forEach((month) => {
      doc.text(`- ${month.month}: ${this.formatCurrency(month.total_spend)}`, 50, y);
      y += 14;
    });

    y += 10;
    doc.text(`Open Cases: ${CaseManager.cases?.length || 0}`, 40, y);

    const dateStr = new Date().toLocaleString();
    doc.setTextColor(120, 135, 155);
    doc.setFontSize(9);
    doc.text(`Generated: ${dateStr}`, 40, doc.internal.pageSize.getHeight() - 30);

    doc.save(`kavach-risk-report-${new Date().toISOString().split('T')[0]}.pdf`);
    Toast.show('Report downloaded', 'success');
  },
  
  exportTable(tableName) {
    const data = Store.get('transactions');
    if (!data || data.length === 0) {
      Toast.show('No data to export', 'error');
      return;
    }
    
    const csv = this.convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kavach-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    Toast.show('Export downloaded', 'success');
  },

  exportFlaggedPdf() {
    const rows = this.tables.fraud?.filteredData || [];
    if (!rows.length) {
      Toast.show('No flagged transactions to export', 'error');
      return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      Toast.show('PDF library not loaded', 'error');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const profile = Store.get('userProfile') || {};
    const analystName = profile.name || 'Analyst';
    const auditType = profile.sheet_type || 'Audit';

    // Watermark
    doc.setTextColor(80, 98, 120);
    doc.setFontSize(60);
    doc.setGState(new doc.GState({ opacity: 0.08 }));
    doc.text('KAVACH', doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() / 2, {
      align: 'center',
      angle: 25
    });
    doc.setGState(new doc.GState({ opacity: 1 }));

    doc.setFillColor(12, 18, 36);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 80, 'F');

    doc.setTextColor(226, 232, 240);
    doc.setFontSize(20);
    doc.text('KAVACH', 40, 45);
    doc.setFontSize(11);
    doc.text('Flagged Transactions Report', 40, 65);
    doc.text(`Analyst: ${analystName}`, 260, 45);
    doc.text(`Audit: ${auditType}`, 260, 65);

    doc.setFillColor(56, 189, 248);
    doc.roundedRect(doc.internal.pageSize.getWidth() - 170, 30, 130, 28, 10, 10, 'F');
    doc.setTextColor(2, 6, 23);
    doc.setFontSize(10);
    doc.text('KAVACH Verified', doc.internal.pageSize.getWidth() - 150, 48);

    const headers = [
      ['User', 'Amount', 'Country', 'Score', 'Signals', 'Risk'],
    ];
    const body = rows.map(r => [
      r.user_id,
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(r.amount || 0),
      r.country || '—',
      (r.fraud_score || 0).toFixed(2),
      [
        r.rule_based_fraud_flag ? 'Rules' : null,
        r.model_fraud_flag ? 'Model' : null,
        r.velocity_flag ? 'Velocity' : null
      ].filter(Boolean).join(' + ') || 'None',
      (r.fraud_score || 0) > 0.75 ? 'Critical' : (r.fraud_score || 0) > 0.4 ? 'Warning' : 'Low'
    ]);

    doc.autoTable({
      head: headers,
      body,
      startY: 100,
      styles: {
        fontSize: 9,
        textColor: [226, 232, 240],
        fillColor: [12, 18, 36],
        lineColor: [30, 41, 59],
        lineWidth: 0.5
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [226, 232, 240],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [11, 16, 32]
      },
      margin: { left: 40, right: 40 }
    });

    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(9);
    const dateStr = new Date().toLocaleString();
    doc.text(`Analyst: ${analystName} • Audit: ${auditType} • Generated: ${dateStr}`, 40, pageHeight - 30);

    doc.save(`kavach-flagged-transactions-${new Date().toISOString().split('T')[0]}.pdf`);
    Toast.show('Flagged transactions PDF downloaded', 'success');
  },
  
  convertToCSV(data) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        let val = row[h];
        if (typeof val === 'string' && val.includes(',')) {
          val = `"${val}"`;
        }
        return val;
      }).join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  },
  
  initScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    
    DOM.$$('.reveal').forEach(el => observer.observe(el));
  }
};

// ==========================================
// Initialize
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});
