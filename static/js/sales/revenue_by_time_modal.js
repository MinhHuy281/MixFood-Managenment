// # File này chịu trách nhiệm xử lý hộp thoại Báo cáo Doanh thu theo thời gian: lọc từ ngày đến ngày, vẽ biểu đồ trực quan và xuất dữ liệu.
(function initRevenueByTimeModal() {
    const modal = document.getElementById('modal-revenue-by-time');
    if (!modal) return;

    const closeBtn = document.getElementById('rev-time-modal-close');
    const modeSelect = document.getElementById('rev-time-mode');
    const fromInput = document.getElementById('rev-time-from');
    const toInput = document.getElementById('rev-time-to');
    const runBtn = document.getElementById('rev-time-btn-run');
    const exportBtn = document.getElementById('rev-time-btn-export');
    const periodHeader = document.getElementById('rev-time-col-period');
    const tbody = document.getElementById('rev-time-tbody');
    const totalInvEl = document.getElementById('rev-time-total-invoices');
    const totalAmtEl = document.getElementById('rev-time-total-amount');

    const slotControls = [1, 2, 3].map((idx) => ({
        index: idx,
        row: modal.querySelector(`.rev-time-slot-row[data-slot="${idx}"]`),
        checkbox: document.getElementById(`rev-slot-${idx}-enabled`),
        from: document.getElementById(`rev-slot-${idx}-from`),
        to: document.getElementById(`rev-slot-${idx}-to`),
    }));

    const MIN_GRID_ROWS = 12;

    function getLocalTodayISO() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function initDefaultDates() {
        const today = getLocalTodayISO();
        if (fromInput && !fromInput.value) fromInput.value = today;
        if (toInput && !toInput.value) toInput.value = today;
    }

    function syncSlotRowStates() {
        slotControls.forEach((s) => {
            if (!s.row || !s.checkbox) return;
            s.row.classList.toggle('is-active', s.checkbox.checked);
        });
    }

    function buildQueryParams() {
        const params = new URLSearchParams();
        params.set('mode', modeSelect ? modeSelect.value : 'day');
        if (fromInput && fromInput.value) params.set('from_date', fromInput.value);
        if (toInput && toInput.value) params.set('to_date', toInput.value);

        slotControls.forEach((s) => {
            if (s.checkbox && s.checkbox.checked) {
                params.set(`slot${s.index}_enabled`, '1');
            }
            if (s.from && s.from.value) {
                params.set(`slot${s.index}_from`, s.from.value);
            }
            if (s.to && s.to.value) {
                params.set(`slot${s.index}_to`, s.to.value);
            }
        });
        return params;
    }

    function renderTableRows(rows, periodHeaderText) {
        if (periodHeader && periodHeaderText) {
            periodHeader.textContent = periodHeaderText;
        }
        const safeRows = Array.isArray(rows) ? rows : [];
        let html = '';

        safeRows.forEach((row, idx) => {
            const activeClass = idx === 0 ? 'is-selected' : '';
            html += `
                <tr class="rev-time-data-row ${activeClass}" data-period="${row.period || ''}">
                    <td class="col-period">${row.period || ''}</td>
                    <td class="col-invoices text-right">${row.invoice_count ?? 0}</td>
                    <td class="col-revenue text-right">${row.revenue_formatted || '0'}</td>
                </tr>
            `;
        });

        const fillerCount = Math.max(0, MIN_GRID_ROWS - safeRows.length);
        for (let i = 0; i < fillerCount; i++) {
            html += `
                <tr class="rev-time-empty-row" aria-hidden="true">
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                    <td>&nbsp;</td>
                </tr>
            `;
        }

        tbody.innerHTML = html;

        tbody.querySelectorAll('.rev-time-data-row').forEach((tr) => {
            tr.addEventListener('click', () => {
                tbody.querySelectorAll('.rev-time-data-row.is-selected').forEach((el) => el.classList.remove('is-selected'));
                tr.classList.add('is-selected');
            });
        });
    }

    async function fetchRevenueByTime() {
        const apiUrl = modal.dataset.apiUrl;
        if (!apiUrl) return;

        if (runBtn) runBtn.disabled = true;
        try {
            const qs = buildQueryParams().toString();
            const response = await fetch(`${apiUrl}?${qs}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Không thể tải báo cáo doanh thu theo thời gian.');
            }

            renderTableRows(data.rows, data.period_header || 'Ngày');
            if (totalInvEl) totalInvEl.textContent = data.total_invoices ?? 0;
            if (totalAmtEl) totalAmtEl.textContent = `${data.total_revenue_formatted || '0'} đ`;
        } catch (err) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="rev-time-error">⚠️ ${err.message || 'Lỗi kết nối máy chủ.'}</td>
                </tr>
            `;
        } finally {
            if (runBtn) runBtn.disabled = false;
        }
    }

    function openModal() {
        initDefaultDates();
        syncSlotRowStates();
        modal.hidden = false;
        document.body.classList.add('modal-open');

        // Đóng các menu dropdown trên thanh điều hướng POS
        document.querySelectorAll('.pos-menu-item.open').forEach((item) => {
            item.classList.remove('open');
            const btn = item.querySelector('.nav-menu-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        fetchRevenueByTime();
    }

    function closeModal() {
        modal.hidden = true;
        document.body.classList.remove('modal-open');
    }

    window.openRevenueByTimeModal = openModal;
    window.closeRevenueByTimeModal = closeModal;

    // Gắn sự kiện mở từ menu BÁO CÁO -> Doanh thu (Theo thời gian)
    document.querySelectorAll('#open-revenue-time-menu, [data-open-revenue-time]').forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openModal();
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.hidden) {
            closeModal();
        }
    });

    if (runBtn) {
        runBtn.addEventListener('click', () => fetchRevenueByTime());
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            const labelMap = { day: 'Ngày', month: 'Tháng', year: 'Năm' };
            if (periodHeader) periodHeader.textContent = labelMap[modeSelect.value] || 'Ngày';
            fetchRevenueByTime();
        });
    }

    slotControls.forEach((s) => {
        if (s.checkbox) {
            s.checkbox.addEventListener('change', () => {
                syncSlotRowStates();
                fetchRevenueByTime();
            });
        }
        if (s.from) {
            s.from.addEventListener('change', () => {
                if (s.checkbox && s.checkbox.checked) fetchRevenueByTime();
            });
        }
        if (s.to) {
            s.to.addEventListener('change', () => {
                if (s.checkbox && s.checkbox.checked) fetchRevenueByTime();
            });
        }
    });

    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const exportUrl = modal.dataset.exportUrl;
            if (!exportUrl) return;
            const qs = buildQueryParams().toString();
            window.location.href = `${exportUrl}?${qs}`;
        });
    }

    // Tự động mở nếu URL có ?open_revenue_time=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open_revenue_time') === '1') {
        setTimeout(() => openModal(), 150);
    }
})();
