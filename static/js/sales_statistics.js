/**
 * Sales Statistics Controller (Thống kê bán hàng)
 * Chuẩn hệ thống F&B POS SaaS 2026 và giao diện MixFood
 */
(() => {
    let currentDishes = [];

    const pad = (n) => String(n).padStart(2, '0');

    const getFormattedDateTime = (date, isEnd = false) => {
        const d = date || new Date();
        const timePart = isEnd ? '23:59' : '00:00';
        return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${timePart}`;
    };

    const removeVietnameseTones = (str) => {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase();
    };

    const getElements = () => ({
        modal: document.getElementById('modal-sales-statistics'),
        closeBtn: document.getElementById('sales-stats-modal-close'),
        openMenuBtn: document.getElementById('open-sales-stats-menu'),
        fromInput: document.getElementById('sales-stats-from-input'),
        toInput: document.getElementById('sales-stats-to-input'),
        markSelect: document.getElementById('sales-stats-mark-select'),
        refreshBtn: document.getElementById('sales-stats-btn-refresh'),
        printBtn: document.getElementById('sales-stats-btn-print'),
        searchInput: document.getElementById('sales-stats-search-input'),
        searchClearBtn: document.getElementById('sales-stats-search-clear'),
        exportBtn: document.getElementById('sales-stats-btn-export'),
        thMark: document.getElementById('th-dish-mark'),

        // Tbodies
        cashiersTbody: document.getElementById('sales-stats-cashiers-tbody'),
        areasTbody: document.getElementById('sales-stats-areas-tbody'),
        paymentsTbody: document.getElementById('sales-stats-payments-tbody'),
        tablesTbody: document.getElementById('sales-stats-tables-tbody'),
        dishesTbody: document.getElementById('sales-stats-dishes-tbody'),
        groupsTbody: document.getElementById('sales-stats-groups-tbody'),
        typesTbody: document.getElementById('sales-stats-types-tbody'),

        // Footer Summary
        sumInvoices: document.getElementById('sales-stats-sum-invoices'),
        sumRevenue: document.getElementById('sales-stats-sum-revenue'),
        sumDiscountCount: document.getElementById('sales-stats-sum-discount-count'),
        sumDiscount: document.getElementById('sales-stats-sum-discount'),
        sumProfit: document.getElementById('sales-stats-sum-profit'),
        sumCogs: document.getElementById('sales-stats-sum-cogs'),
    });

    const renderDishesTable = () => {
        const els = getElements();
        if (!els.dishesTbody) return;

        const markMode = els.markSelect ? els.markSelect.value : 'mark';
        const searchKw = els.searchInput ? removeVietnameseTones(els.searchInput.value.trim()) : '';

        if (els.searchClearBtn) {
            els.searchClearBtn.hidden = searchKw.length === 0;
        }

        const filtered = currentDishes.filter((d) => {
            if (!searchKw) return true;
            const nameNorm = removeVietnameseTones(d.name);
            const codeNorm = removeVietnameseTones(d.code);
            return nameNorm.includes(searchKw) || codeNorm.includes(searchKw);
        });

        if (filtered.length === 0) {
            els.dishesTbody.innerHTML = '<tr><td colspan="7" class="stats-empty">Không tìm thấy món nào phù hợp.</td></tr>';
            return;
        }

        els.dishesTbody.innerHTML = filtered.map((d) => {
            let markVal = '';
            if (markMode === 'mark') {
                markVal = d.mark || (d.name ? d.name.slice(0, 1).toUpperCase() + '.' : '');
            } else if (markMode === 'code') {
                markVal = d.code || (d.mark || '');
            } else if (markMode === 'initial') {
                markVal = d.name ? d.name.slice(0, 1).toUpperCase() : '';
            } else {
                markVal = '';
            }

            return `
                <tr>
                    <td class="text-center font-bold text-muted">${markVal}</td>
                    <td class="font-medium text-slate-800" title="${d.name} (${d.category || ''})">${d.name}</td>
                    <td class="text-center text-muted">${d.unit || 'Phần'}</td>
                    <td class="text-center font-semibold text-slate-900">${d.quantity}</td>
                    <td class="text-center text-muted">${d.discount_count || 0}</td>
                    <td class="text-right text-discount">${d.discount_amount_formatted || '0'}</td>
                    <td class="text-right font-bold text-slate-900">${d.revenue_formatted || '0'}</td>
                </tr>
            `;
        }).join('');
    };

    const renderSimpleTable = (tbody, items, col1Name = 'name', col2Count = 'count', col3Rev = 'revenue_formatted', colSpan = 3) => {
        if (!tbody) return;
        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="stats-empty">Không có dữ liệu</td></tr>`;
            return;
        }

        if (colSpan === 3) {
            tbody.innerHTML = items.map((it) => `
                <tr>
                    <td class="font-medium text-slate-800" title="${it[col1Name]}">${it[col1Name]}</td>
                    <td class="text-right font-semibold text-slate-700">${it[col2Count] || 0}</td>
                    <td class="text-right font-bold text-slate-900">${it[col3Rev] || '0'}</td>
                </tr>
            `).join('');
        } else if (colSpan === 2) {
            tbody.innerHTML = items.map((it) => `
                <tr>
                    <td class="font-medium text-slate-800" title="${it[col1Name]}">${it[col1Name]}</td>
                    <td class="text-right font-bold text-slate-900">${it[col3Rev] || '0'}</td>
                </tr>
            `).join('');
        }
    };

    const fetchStatistics = async () => {
        const els = getElements();
        const fromVal = (els.fromInput?.value || '').trim();
        const toVal = (els.toInput?.value || '').trim();

        // Update loading UI
        const loadingRow3 = '<tr><td colspan="3" class="stats-loading">Đang tải...</td></tr>';
        const loadingRow2 = '<tr><td colspan="2" class="stats-loading">Đang tải...</td></tr>';
        if (els.cashiersTbody) els.cashiersTbody.innerHTML = loadingRow3;
        if (els.areasTbody) els.areasTbody.innerHTML = loadingRow3;
        if (els.paymentsTbody) els.paymentsTbody.innerHTML = loadingRow3;
        if (els.tablesTbody) els.tablesTbody.innerHTML = loadingRow3;
        if (els.dishesTbody) els.dishesTbody.innerHTML = '<tr><td colspan="7" class="stats-loading">Đang tải danh sách món...</td></tr>';
        if (els.groupsTbody) els.groupsTbody.innerHTML = loadingRow2;
        if (els.typesTbody) els.typesTbody.innerHTML = loadingRow2;

        const params = new URLSearchParams();
        if (fromVal) params.append('from', fromVal);
        if (toVal) params.append('to', toVal);

        // Update Excel download link
        if (els.exportBtn) {
            els.exportBtn.href = `/sales/statistics/export/?${params.toString()}`;
        }

        try {
            const resp = await fetch(`/sales/statistics/api/?${params.toString()}`);
            if (!resp.ok) throw new Error('Không thể tải dữ liệu thống kê bán hàng.');
            const res = await resp.json();
            if (!res.ok) throw new Error(res.error || 'Lỗi khi xử lý dữ liệu.');

            const stats = res.stats;

            // Render 4 Left Tables
            renderSimpleTable(els.cashiersTbody, stats.cashiers, 'name', 'count', 'revenue_formatted', 3);
            renderSimpleTable(els.areasTbody, stats.areas, 'name', 'count', 'revenue_formatted', 3);
            renderSimpleTable(els.paymentsTbody, stats.payments, 'name', 'count', 'revenue_formatted', 3);
            renderSimpleTable(els.tablesTbody, stats.tables, 'name', 'count', 'revenue_formatted', 3);

            // Render Right Dishes & Categories
            currentDishes = stats.dishes || [];
            renderDishesTable();

            renderSimpleTable(els.groupsTbody, stats.groups, 'name', null, 'revenue_formatted', 2);
            renderSimpleTable(els.typesTbody, stats.types, 'name', null, 'revenue_formatted', 2);

            // Render Footer Summary
            if (els.sumInvoices) els.sumInvoices.textContent = stats.total_invoices;
            if (els.sumRevenue) els.sumRevenue.textContent = stats.net_revenue_formatted;
            if (els.sumDiscountCount) els.sumDiscountCount.textContent = stats.discount_invoice_count;
            if (els.sumDiscount) els.sumDiscount.textContent = stats.total_discount_formatted;
            if (els.sumProfit) els.sumProfit.textContent = stats.gross_profit_formatted;
            if (els.sumCogs) els.sumCogs.textContent = stats.total_cogs_formatted;

        } catch (err) {
            console.error('Lỗi thống kê bán hàng:', err);
            const errHtml = `<tr><td colspan="7" class="stats-error">${err.message || 'Lỗi tải dữ liệu.'}</td></tr>`;
            if (els.dishesTbody) els.dishesTbody.innerHTML = errHtml;
        }
    };

    const openSalesStatistics = () => {
        const els = getElements();
        if (!els.modal) return;

        // Initialize default dates if empty
        const now = new Date();
        if (els.fromInput && !els.fromInput.value) {
            els.fromInput.value = getFormattedDateTime(now, false);
        }
        if (els.toInput && !els.toInput.value) {
            els.toInput.value = getFormattedDateTime(now, true);
        }

        els.modal.hidden = false;
        fetchStatistics();
    };

    const closeSalesStatistics = () => {
        const els = getElements();
        if (els.modal) els.modal.hidden = true;
    };

    const initEventListeners = () => {
        const els = getElements();

        // Open triggers
        if (els.openMenuBtn) {
            els.openMenuBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Close dropdown menubars
                document.querySelectorAll('.pos-menu-item').forEach((item) => item.classList.remove('open'));
                document.querySelectorAll('.nav-menu-btn').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
                openSalesStatistics();
            });
        }

        // Close triggers
        if (els.closeBtn) {
            els.closeBtn.addEventListener('click', closeSalesStatistics);
        }

        if (els.modal) {
            els.modal.addEventListener('click', (e) => {
                if (e.target === els.modal) {
                    closeSalesStatistics();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && els.modal && !els.modal.hidden) {
                closeSalesStatistics();
            }
        });

        // Filter button
        if (els.refreshBtn) {
            els.refreshBtn.addEventListener('click', fetchStatistics);
        }

        // Search dish
        if (els.searchInput) {
            els.searchInput.addEventListener('input', renderDishesTable);
            els.searchInput.addEventListener('keyup', renderDishesTable);
        }
        if (els.searchClearBtn) {
            els.searchClearBtn.addEventListener('click', () => {
                if (els.searchInput) {
                    els.searchInput.value = '';
                    els.searchInput.focus();
                }
                renderDishesTable();
            });
        }

        // Mark column selector
        if (els.markSelect) {
            els.markSelect.addEventListener('change', renderDishesTable);
        }

        // Print button (In kiểm bán)
        if (els.printBtn) {
            els.printBtn.addEventListener('click', () => {
                const fromVal = (els.fromInput?.value || '').trim();
                const toVal = (els.toInput?.value || '').trim();
                const params = new URLSearchParams();
                if (fromVal) params.append('from', fromVal);
                if (toVal) params.append('to', toVal);
                params.append('auto', '1');
                window.open(`/sales/statistics/print/?${params.toString()}`, '_blank', 'width=920,height=850,menubar=no,toolbar=no');
            });
        }
        // Auto-open if query param or hash requested
        try {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('open_stats') === '1' || window.location.hash === '#sales-statistics') {
                openSalesStatistics();
            }
        } catch (err) {
            console.warn('Auto open stats check error:', err);
        }
    };

    // Expose global function
    window.openSalesStatistics = openSalesStatistics;
    window.closeSalesStatistics = closeSalesStatistics;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEventListeners);
    } else {
        initEventListeners();
    }
})();
