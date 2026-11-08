// # File này chịu trách nhiệm điều khiển toàn bộ tương tác thời gian thực trên Admin Live Remote Dashboard: Real-time Polling 2.5s, cập nhật Live Feed, sơ đồ bàn, phát âm báo thao tác nhạy cảm và điều hướng tab Mobile.

(() => {
    'use strict';

    // # Trạng thái ứng dụng
    let isLiveSync = true;
    let isSoundEnabled = true;
    let pollIntervalId = null;
    let latestActivityId = 0;
    let currentActiveFilter = 'all';
    let currentAreaFilter = 'all';
    let currentOpenModalTableId = null;

    // # DOM Elements
    const feedList = document.getElementById('live-feed-list');
    const searchInput = document.getElementById('feed-search-input');
    const btnToggleSync = document.getElementById('btn-toggle-sync');
    const btnToggleSound = document.getElementById('btn-toggle-sound');
    const audioIcon = document.getElementById('audio-icon');
    const liveClock = document.getElementById('live-clock');
    const feedBadge = document.getElementById('feed-unread-badge');

    // # KPI Elements
    const kpiRevenue = document.getElementById('kpi-val-revenue');
    const kpiInvoices = document.getElementById('kpi-sub-invoices');
    const kpiTables = document.getElementById('kpi-val-tables');
    const kpiPending = document.getElementById('kpi-val-pending');
    const kpiSensitive = document.getElementById('kpi-val-sensitive');
    const cardSensitive = document.getElementById('card-sensitive');

    const detailRevToday = document.getElementById('detail-rev-today');
    const detailPaidCount = document.getElementById('detail-paid-count');
    const detailPendingAmount = document.getElementById('detail-pending-amount');
    const detailOccupiedRatio = document.getElementById('detail-occupied-ratio');
    const detailSensitiveCount = document.getElementById('detail-sensitive-count');

    // # Modal Elements
    const modalTableDetail = document.getElementById('modal-table-detail');
    const modalTitle = document.getElementById('modal-table-detail-title');
    const modalSub = document.getElementById('modal-table-detail-sub');
    const modalBody = document.getElementById('modal-table-detail-body');
    const btnCloseModal = document.getElementById('btn-close-table-modal');
    const btnCancelModal = document.getElementById('btn-modal-cancel');

    // # Lấy ID lớn nhất ban đầu trong DOM
    const initialItems = document.querySelectorAll('.feed-item[data-id]');
    initialItems.forEach((el) => {
        const idVal = parseInt(el.getAttribute('data-id'), 10);
        if (idVal && idVal > latestActivityId) {
            latestActivityId = idVal;
        }
    });

    // # Hàm phát âm thanh cảnh báo ngắn (Web Audio API không cần tải file âm thanh ngoài)
    function playAlertChime(isSensitive = false) {
        if (!isSoundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = isSensitive ? 'sawtooth' : 'sine';
            osc.frequency.setValueAtTime(isSensitive ? 880 : 587.33, ctx.currentTime);
            if (isSensitive) {
                osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25);
            }

            gain.gain.setValueAtTime(0.12, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (_) {
            // Trình duyệt có thể chặn âm thanh nếu chưa tương tác người dùng
        }
    }

    // # Hàm render một thẻ sự kiện mới
    function renderFeedItem(item) {
        const isSensitive = item.is_sensitive;
        const article = document.createElement('article');
        article.className = `feed-item ${isSensitive ? 'item-sensitive' : ''} new-arrival`;
        article.setAttribute('data-id', item.id);
        article.setAttribute('data-action', item.action);
        article.setAttribute('data-actor', item.actor_name);
        article.setAttribute('data-sensitive', isSensitive ? 'true' : 'false');

        const firstLetter = (item.actor_name || 'H').slice(0, 1).toUpperCase();
        let reasonHtml = '';
        if (item.reason) {
            reasonHtml = `
                <div class="feed-reason-box">
                    <span class="reason-label">Lý do:</span>
                    <span class="reason-val">${escapeHtml(item.reason)}</span>
                </div>
            `;
        }

        article.innerHTML = `
            <div class="feed-item-header">
                <div class="feed-actor-info">
                    <span class="feed-actor-avatar">${escapeHtml(firstLetter)}</span>
                    <div>
                        <strong class="feed-actor-name">${escapeHtml(item.actor_name)}</strong>
                        <span class="feed-time-text">${escapeHtml(item.time_str)} (${escapeHtml(item.time_ago)})</span>
                    </div>
                </div>
                <span class="feed-action-badge" style="background-color: ${item.action_color || '#475569'};">${escapeHtml(item.action_label)}</span>
            </div>
            <div class="feed-item-body">
                <p class="feed-description">${escapeHtml(item.description)}</p>
                ${reasonHtml}
            </div>
        `;
        return article;
    }

    // # Hàm lọc hiển thị danh sách Live Feed
    function applyFeedFilter() {
        const query = (searchInput.value || '').trim().toLowerCase();
        const items = feedList.querySelectorAll('.feed-item');

        items.forEach((item) => {
            const action = item.getAttribute('data-action') || '';
            const isSensitive = item.getAttribute('data-sensitive') === 'true';
            const textContent = item.textContent.toLowerCase();

            let matchFilter = true;
            if (currentActiveFilter === 'sensitive') {
                matchFilter = isSensitive;
            } else if (currentActiveFilter === 'payment') {
                matchFilter = action.includes('payment') || action.includes('invoice');
            } else if (currentActiveFilter === 'table') {
                matchFilter = action.includes('table') || action.includes('order');
            } else if (currentActiveFilter === 'menu') {
                matchFilter = action.includes('menu') || action.includes('recipe');
            }

            const matchQuery = !query || textContent.includes(query);

            if (matchFilter && matchQuery) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // # Hàm cập nhật giao diện Sơ đồ bàn khi có dữ liệu mới
    function updateTablesDisplay(tablesData) {
        if (!Array.isArray(tablesData) || !tablesData.length) return;

        tablesData.forEach((t) => {
            const card = document.querySelector(`.admin-table-card[data-table-id="${t.id}"]`);
            if (!card) return;

            card.className = `admin-table-card table-status-${t.status}`;
            card.setAttribute('data-status', t.status);

            const statusBadge = card.querySelector('.table-badge-status');
            if (statusBadge) statusBadge.textContent = t.status_display;

            const preview = card.querySelector('.table-order-preview');
            if (preview) {
                if (t.status === 'occupied' && t.order) {
                    preview.innerHTML = `
                        <div class="occupied-indicator">
                            <span class="badge-active-pulse"></span>
                            <span>${t.order.item_count} món • <strong>${t.order.total_fmt}</strong></span>
                        </div>
                        <span class="table-view-detail-hint">Bấm xem chi tiết &gt;</span>
                    `;
                } else if (t.status === 'reserved') {
                    preview.innerHTML = `<span class="text-muted">Đã đặt trước</span>`;
                } else {
                    preview.innerHTML = `<span class="text-available">Bàn sẵn sàng</span>`;
                }
            }
        });

        if (currentOpenModalTableId && modalTableDetail && !modalTableDetail.hidden) {
            const openTable = tablesData.find((t) => String(t.id) === String(currentOpenModalTableId));
            if (openTable) {
                loadTableDetail(openTable.id, openTable.name, true);
            }
        }
    }

    // # Hàm Polling gọi API lấy dữ liệu mới
    async function fetchLiveUpdates() {
        if (!isLiveSync) return;

        try {
            const resp = await fetch(`/admin/live-api/?last_id=${latestActivityId}`, {
                headers: { 'Accept': 'application/json' },
            });
            if (!resp.ok) return;

            const data = await resp.json();
            if (!data.ok) return;

            // Cập nhật đồng hồ server
            if (liveClock && data.server_time) {
                liveClock.textContent = data.server_time;
            }

            // Cập nhật KPI
            if (data.kpis) {
                const k = data.kpis;
                if (kpiRevenue) kpiRevenue.textContent = k.revenue_today_fmt;
                if (kpiInvoices) kpiInvoices.textContent = `${k.paid_count} hóa đơn đã thu`;
                if (kpiTables) kpiTables.textContent = `${k.occupied_count}/${k.total_tables}`;
                if (kpiPending) kpiPending.textContent = k.pending_amount_fmt;
                if (kpiSensitive) kpiSensitive.textContent = k.sensitive_count;

                if (cardSensitive) {
                    if (k.sensitive_count > 0) {
                        cardSensitive.classList.add('has-alert');
                    } else {
                        cardSensitive.classList.remove('has-alert');
                    }
                }

                if (detailRevToday) detailRevToday.textContent = k.revenue_today_fmt;
                if (detailPaidCount) detailPaidCount.textContent = `${k.paid_count} đơn`;
                if (detailPendingAmount) detailPendingAmount.textContent = k.pending_amount_fmt;
                if (detailOccupiedRatio) detailOccupiedRatio.textContent = `${k.occupied_count}/${k.total_tables} bàn`;
                if (detailSensitiveCount) detailSensitiveCount.textContent = `${k.sensitive_count} lượt`;
            }

            // Cập nhật các mục sự kiện mới
            if (Array.isArray(data.activities) && data.activities.length > 0) {
                let hasSensitiveAlert = false;
                const emptyState = feedList.querySelector('.feed-empty-state');
                if (emptyState) emptyState.remove();

                data.activities.forEach((act) => {
                    if (act.id > latestActivityId) {
                        latestActivityId = act.id;
                    }
                    if (act.is_sensitive) hasSensitiveAlert = true;

                    const newEl = renderFeedItem(act);
                    feedList.insertBefore(newEl, feedList.firstChild);
                });

                playAlertChime(hasSensitiveAlert);
                applyFeedFilter();
            }

            // Cập nhật sơ đồ bàn
            if (data.tables) {
                updateTablesDisplay(data.tables);
            }

            if (data.latest_id && data.latest_id > latestActivityId) {
                latestActivityId = data.latest_id;
            }

        } catch (err) {
            console.warn('[Admin Live Monitor] Lỗi kết nối polling:', err);
        }
    }

    // # Bắt đầu polling
    function startPolling() {
        if (pollIntervalId) clearInterval(pollIntervalId);
        pollIntervalId = setInterval(fetchLiveUpdates, 2500);
    }

    // # Xử lý chuyển tab
    function setupTabNavigation() {
        const tabBtns = document.querySelectorAll('.tab-btn, .bottom-nav-item');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetTabId = btn.getAttribute('data-tab');
                if (!targetTabId) return;

                // Sync active state cho cả tab-btn và bottom-nav-item
                tabBtns.forEach((b) => {
                    if (b.getAttribute('data-tab') === targetTabId) {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });

                tabPanes.forEach((pane) => {
                    if (pane.id === targetTabId) {
                        pane.classList.add('active');
                    } else {
                        pane.classList.remove('active');
                    }
                });
            });
        });
    }

    // # Xử lý lọc danh mục Live Feed
    function setupFilterChips() {
        const chips = document.querySelectorAll('.chip-filter');
        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                chips.forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                currentActiveFilter = chip.getAttribute('data-filter') || 'all';
                applyFeedFilter();
            });
        });

        if (searchInput) {
            searchInput.addEventListener('input', applyFeedFilter);
        }
    }

    // # Xử lý lọc khu vực cho sơ đồ bàn
    function setupAreaFilter() {
        const areaChips = document.querySelectorAll('.area-chip');
        const tableCards = document.querySelectorAll('.admin-table-card');

        areaChips.forEach((chip) => {
            chip.addEventListener('click', () => {
                areaChips.forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                const selectedArea = chip.getAttribute('data-area') || 'all';

                tableCards.forEach((card) => {
                    const cardArea = card.getAttribute('data-area-id');
                    if (selectedArea === 'all' || selectedArea === cardArea) {
                        card.style.display = '';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    }

    async function loadTableDetail(tableId, tableName, isSilent = false) {
        if (!tableId) return;
        currentOpenModalTableId = tableId;

        if (!isSilent) {
            modalTitle.textContent = `Chi tiết ${tableName || 'Bàn'}`;
            modalSub.textContent = 'Đang tải thông tin đơn hàng...';
            modalBody.innerHTML = `<div class="table-modal-loading">Đang lấy danh sách món gọi...</div>`;
            modalTableDetail.hidden = false;
        }

        try {
            const resp = await fetch(`/admin/table-detail/${tableId}/?_t=${Date.now()}`);
            if (!resp.ok) throw new Error('Không thể tải chi tiết bàn.');

            const data = await resp.json();
            if (!data.ok || !data.has_order) {
                modalSub.textContent = `${data.table?.area || ''} • Chưa có đơn mở`;
                modalBody.innerHTML = `<p class="text-muted text-center" style="padding: 20px 0;">Bàn này hiện chưa có món ăn nào được gọi.</p>`;
                return;
            }

            const ord = data.order;
            modalSub.textContent = `${data.table.area} • Đơn: ${ord.order_code} • NV: ${ord.staff} (${ord.created_at})`;

            let itemsRows = '';
            ord.items.forEach((it, idx) => {
                itemsRows += `
                    <tr>
                        <td>${idx + 1}</td>
                        <td><strong>${escapeHtml(it.name)}</strong>${it.note ? `<br><small class="text-muted">${escapeHtml(it.note)}</small>` : ''}</td>
                        <td class="text-center">${it.quantity} ${escapeHtml(it.unit)}</td>
                        <td class="text-right">${it.price_fmt}</td>
                        <td class="text-right"><strong>${it.total_fmt}</strong></td>
                    </tr>
                `;
            });

            modalBody.innerHTML = `
                <table class="order-items-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Tên món</th>
                            <th class="text-center">SL</th>
                            <th class="text-right">Đơn giá</th>
                            <th class="text-right">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>${itemsRows}</tbody>
                </table>
                <div class="order-modal-summary">
                    <span>Tổng tiền tạm tính:</span>
                    <strong>${ord.total_fmt}</strong>
                </div>
            `;
        } catch (err) {
            if (!isSilent) {
                modalBody.innerHTML = `<p class="text-danger text-center" style="padding: 20px 0;">Lỗi kết nối máy chủ.</p>`;
            }
        }
    }

    // # Xử lý popup chi tiết bàn đang phục vụ
    function setupTableModal() {
        const container = document.getElementById('live-tables-container');
        if (!container) return;

        container.addEventListener('click', async (e) => {
            const card = e.target.closest('.admin-table-card');
            if (!card) return;

            const tableId = card.getAttribute('data-table-id');
            const tableName = card.querySelector('.table-badge-name')?.textContent || 'Bàn';
            const status = card.getAttribute('data-status');

            if (status !== 'occupied') {
                return; // Chỉ mở chi tiết nếu bàn đang phục vụ
            }

            loadTableDetail(tableId, tableName, false);
        });

        const closeModal = () => {
            currentOpenModalTableId = null;
            modalTableDetail.hidden = true;
        };
        if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
        if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
        modalTableDetail.addEventListener('click', (e) => {
            if (e.target === modalTableDetail) closeModal();
        });
    }

    // # Xử lý các nút bật tắt ở Header
    function setupHeaderControls() {
        if (btnToggleSync) {
            btnToggleSync.addEventListener('click', () => {
                isLiveSync = !isLiveSync;
                btnToggleSync.classList.toggle('active', isLiveSync);
                btnToggleSync.querySelector('.toggle-text').textContent = isLiveSync ? 'Live Sync' : 'Tạm dừng';
            });
        }

        if (btnToggleSound) {
            btnToggleSound.addEventListener('click', () => {
                isSoundEnabled = !isSoundEnabled;
                btnToggleSound.classList.toggle('active', isSoundEnabled);
                audioIcon.textContent = isSoundEnabled ? '🔔' : '🔕';
            });
        }
    }

    // # Hàm thoát mã HTML an toàn (chống XSS)
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // # Khởi chạy khi DOM sẵn sàng
    document.addEventListener('DOMContentLoaded', () => {
        setupTabNavigation();
        setupFilterChips();
        setupAreaFilter();
        setupTableModal();
        setupHeaderControls();
        startPolling();
    });
})();
