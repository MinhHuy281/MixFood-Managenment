// # File này chịu trách nhiệm xử lý hộp thoại tra cứu Nhật ký hoạt động hệ thống (Activity Log Modal) trên màn hình POS.
// =========================================================================
    // POS ACTIVITY LOG ADMIN MODAL CONTROLLER (NHẬT KÝ HOẠT ĐỘNG TRÊN POS)
    // =========================================================================
    (() => {
        const modal = document.getElementById('pos-activity-admin-modal');
        const openBtn = document.getElementById('open-activity-admin-menu');
        const closeBtn = document.getElementById('pos-activity-modal-close');

        const dateFromInput = document.getElementById('pos-activity-date-from');
        const dateToInput = document.getElementById('pos-activity-date-to');
        const actionSelect = document.getElementById('pos-activity-action-select');
        const staffSelect = document.getElementById('pos-activity-staff-select');
        const orderLogBtn = document.getElementById('pos-activity-btn-order-log');
        const exportBtn = document.getElementById('pos-activity-btn-export');
        const tbody = document.getElementById('pos-activity-tbody');
        const countSpan = document.getElementById('pos-activity-count');

        let isOrderLogActive = false;
        let staffLoaded = false;

        const padZero = (n) => String(n).padStart(2, '0');
        const getTodayFormatted = () => {
            const now = new Date();
            return `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
        };

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const initDates = () => {
            const today = getTodayFormatted();
            if (dateFromInput && !dateFromInput.value) dateFromInput.value = today;
            if (dateToInput && !dateToInput.value) dateToInput.value = today;
        };

        const loadLogs = async () => {
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" class="activity-empty-notice">Đang tải nhật ký...</td></tr>';
            if (countSpan) countSpan.textContent = 'Đang tải...';

            const fromDate = dateFromInput ? dateFromInput.value.trim() : '';
            const toDate = dateToInput ? dateToInput.value.trim() : '';
            const action = actionSelect ? actionSelect.value.trim() : '';
            const actorId = staffSelect ? staffSelect.value.trim() : '';

            const params = new URLSearchParams();
            if (fromDate) params.append('from_date', fromDate);
            if (toDate) params.append('to_date', toDate);
            if (action && !isOrderLogActive) params.append('action', action);
            if (actorId) params.append('actor_id', actorId);
            if (isOrderLogActive) params.append('order_log', '1');

            const exportUrl = `/audit/export/?${params.toString()}`;
            if (exportBtn) exportBtn.href = exportUrl;

            try {
                const resp = await fetch(`/audit/api/logs/?${params.toString()}`);
                if (!resp.ok) throw new Error('Không thể tải nhật ký hoạt động.');
                const data = await resp.json();

                // Populate staff dropdown if not done
                if (!staffLoaded && data.staff_list && staffSelect) {
                    staffSelect.innerHTML = '<option value="">&lt;Nhân viên&gt;</option>';
                    data.staff_list.forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u.id;
                        opt.textContent = u.name;
                        staffSelect.appendChild(opt);
                    });
                    staffLoaded = true;
                }

                const logs = data.logs || [];
                if (countSpan) countSpan.textContent = `${logs.length} bản ghi`;

                if (logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="activity-empty-notice">Không có hoạt động nào thỏa mãn bộ lọc.</td></tr>';
                    return;
                }

                tbody.innerHTML = logs.map(log => {
                    const hasReasonInDesc = log.reason && log.description && (log.description.includes(`(${log.reason})`) || log.description.includes(`Lý do: ${log.reason}`));
                    const reasonHtml = (log.reason && !hasReasonInDesc) ? `<span class="activity-reason-pill">Lý do: ${escapeHtml(log.reason)}</span>` : '';
                    return `
                        <tr>
                            <td class="text-muted" style="white-space: nowrap; font-size: 12.5px;">${escapeHtml(log.formatted_time)}</td>
                            <td>
                                <span class="activity-action-tag" style="color: ${log.action_color || '#475569'};">
                                    ● ${escapeHtml(log.action_display)}
                                </span>
                            </td>
                            <td class="activity-detail-cell">
                                <span class="activity-desc" style="color: ${log.action_color || '#1e293b'}; font-weight: 500;">${escapeHtml(log.description)}</span>
                                ${reasonHtml}
                            </td>
                            <td>
                                <strong class="activity-actor-name" style="color: ${log.action_color || '#334155'};">${escapeHtml(log.actor_name)}</strong>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4" class="activity-empty-notice" style="color:#ef4444;">${escapeHtml(err.message)}</td></tr>`;
                if (countSpan) countSpan.textContent = 'Lỗi';
            }
        };

        // Trigger open from menu
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
                document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

                if (modal) {
                    modal.hidden = false;
                    initDates();
                    loadLogs();
                }
            });
        }

        // Close modal
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.hidden = true;
            });
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.hidden = true;
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.hidden) {
                modal.hidden = true;
            }
        });

        // Event listeners for filters
        if (dateFromInput) dateFromInput.addEventListener('change', () => loadLogs());
        if (dateToInput) dateToInput.addEventListener('change', () => loadLogs());
        if (actionSelect) actionSelect.addEventListener('change', () => {
            if (isOrderLogActive) {
                isOrderLogActive = false;
                if (orderLogBtn) orderLogBtn.classList.remove('active');
            }
            loadLogs();
        });
        if (staffSelect) staffSelect.addEventListener('change', () => loadLogs());

        // Toggle Order Log
        if (orderLogBtn) {
            orderLogBtn.addEventListener('click', () => {
                isOrderLogActive = !isOrderLogActive;
                orderLogBtn.classList.toggle('active', isOrderLogActive);
                if (isOrderLogActive && actionSelect) {
                    actionSelect.value = '';
                }
                loadLogs();
            });
        }
    })();
