/**
 * MIXFOOD POS & INVENTORY 2026 - QUẢN LÝ KHO HÀNG & XUẤT - NHẬP - TỒN
 */

(function () {
    let cachedIngredients = [];
    let currentActiveTab = 'xnt';
    let currentRangePreset = 'this_month';

    const getCsrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

    const formatMoney = (val) => `${Number(val || 0).toLocaleString('vi-VN')} đ`;
    const formatNumber = (val) => {
        const n = Number(val || 0);
        return n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
    };

    const showInvToast = (msg, isSuccess = true) => {
        const toast = document.querySelector('#inv-modal-toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.className = `inv-toast-banner ${isSuccess ? 'is-success' : 'is-error'}`;
        toast.hidden = false;
        window.clearTimeout(toast._timer);
        toast._timer = window.setTimeout(() => { toast.hidden = true; }, 4500);
    };

    // =========================================================================
    // 1. LOAD & RENDER TAB XUẤT - NHẬP - TỒN (XNT)
    // =========================================================================
    const loadXntData = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiDashboard || '/inventory/api/dashboard/';

        const fromDate = document.querySelector('#inv-date-from')?.value || '';
        const toDate = document.querySelector('#inv-date-to')?.value || '';
        const group = document.querySelector('#inv-select-group')?.value || '';
        const query = document.querySelector('#inv-search-query')?.value || '';
        const lowStockOnly = document.querySelector('#inv-chk-low-stock')?.checked ? '1' : '0';

        const params = new URLSearchParams({
            range: currentRangePreset,
            start_date: fromDate,
            end_date: toDate,
            group: group,
            q: query,
            low_stock_only: lowStockOnly,
        });

        try {
            const resp = await fetch(`${apiUrl}?${params.toString()}`);
            if (!resp.ok) throw new Error('Không thể tải báo cáo kho.');
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Lỗi dữ liệu kho.');

            cachedIngredients = data.ingredients || [];

            // Update Header Range Badge
            const badge = document.querySelector('#inv-range-badge');
            if (badge) badge.textContent = data.range_label || '';

            if (data.start_date_str && document.querySelector('#inv-date-from')) {
                document.querySelector('#inv-date-from').value = data.start_date_str;
            }
            if (data.end_date_str && document.querySelector('#inv-date-to')) {
                document.querySelector('#inv-date-to').value = data.end_date_str;
            }

            // Update KPIs
            const k = data.kpis || {};
            document.querySelector('#inv-kpi-total-val').textContent = k.total_inventory_value_formatted || '0 đ';
            document.querySelector('#inv-kpi-total-count').textContent = k.total_ingredients_count || '0';
            document.querySelector('#inv-kpi-low-stock-count').textContent = k.low_stock_count || '0';
            document.querySelector('#inv-kpi-receipt-val').textContent = k.total_receipt_value_formatted || '0 đ';
            document.querySelector('#inv-kpi-issue-val').textContent = k.total_issue_value_formatted || '0 đ';

            // Populate Group filter dropdown
            const groupSelect = document.querySelector('#inv-select-group');
            if (groupSelect && groupSelect.children.length <= 1) {
                (data.groups || []).forEach((g) => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g;
                    groupSelect.appendChild(opt);
                });
            }

            // Populate Ledger Ingredient dropdown
            const ledgerIngSelect = document.querySelector('#inv-ledger-ingredient');
            if (ledgerIngSelect && ledgerIngSelect.children.length <= 1) {
                cachedIngredients.forEach((ing) => {
                    const opt = document.createElement('option');
                    opt.value = ing.id;
                    opt.textContent = `${ing.code} - ${ing.name} (${ing.unit})`;
                    ledgerIngSelect.appendChild(opt);
                });
            }

            // Render Table Rows
            const tbody = document.querySelector('#inv-xnt-tbody');
            if (!tbody) return;

            const rows = data.report_rows || [];
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="15" class="text-center" style="padding: 24px; color: #64748b;">Không tìm thấy nguyên vật liệu nào phù hợp với bộ lọc.</td></tr>';
                return;
            }

            let sumOpenQty = 0, sumRecQty = 0, sumSaleQty = 0, sumIssQty = 0, sumAdjQty = 0, sumCloseQty = 0, sumCloseVal = 0;

            tbody.innerHTML = rows.map((r, idx) => {
                sumOpenQty += r.opening_stock;
                sumRecQty += r.receipt_qty;
                sumSaleQty += r.sale_qty;
                sumIssQty += r.issue_qty;
                sumAdjQty += r.adjust_qty;
                sumCloseQty += r.closing_stock;
                sumCloseVal += r.closing_val;

                const statusBadge = r.is_low_stock
                    ? '<span class="inv-badge badge-status-low">⚠️ SẮP HẾT</span>'
                    : '<span class="inv-badge badge-status-good">✓ Bình thường</span>';

                return `
                    <tr class="${r.is_low_stock ? 'row-low-stock' : ''}">
                        <td class="text-center">${idx + 1}</td>
                        <td><strong>${r.code}</strong></td>
                        <td><strong>${r.name}</strong></td>
                        <td><span style="color: #64748b;">${r.group}</span></td>
                        <td class="text-center">${r.unit}</td>
                        <td class="text-right">${r.cost_formatted}</td>
                        <td class="text-right">${r.opening_stock_formatted}</td>
                        <td class="text-right text-emerald text-bold">${r.receipt_qty > 0 ? '+' + r.receipt_qty_formatted : '-'}</td>
                        <td class="text-right text-indigo">${r.sale_qty > 0 ? r.sale_qty_formatted : '-'}</td>
                        <td class="text-right text-amber">${r.issue_qty > 0 ? r.issue_qty_formatted : '-'}</td>
                        <td class="text-right">${r.adjust_qty !== 0 ? (r.adjust_qty > 0 ? '+' : '') + r.adjust_qty_formatted : '-'}</td>
                        <td class="text-right text-bold" style="font-size: 13px;">${r.closing_stock_formatted}</td>
                        <td class="text-right text-bold text-blue">${r.closing_val_formatted} đ</td>
                        <td class="text-right text-muted">${r.minimum_stock_formatted}</td>
                        <td class="text-center">${statusBadge}</td>
                    </tr>
                `;
            }).join('');

            // Update Footers
            document.querySelector('#inv-foot-open-qty').textContent = formatNumber(sumOpenQty);
            document.querySelector('#inv-foot-receipt-qty').textContent = sumRecQty > 0 ? '+' + formatNumber(sumRecQty) : '-';
            document.querySelector('#inv-foot-sale-qty').textContent = sumSaleQty > 0 ? formatNumber(sumSaleQty) : '-';
            document.querySelector('#inv-foot-issue-qty').textContent = sumIssQty > 0 ? formatNumber(sumIssQty) : '-';
            document.querySelector('#inv-foot-adj-qty').textContent = sumAdjQty !== 0 ? (sumAdjQty > 0 ? '+' : '') + formatNumber(sumAdjQty) : '-';
            document.querySelector('#inv-foot-close-qty').textContent = formatNumber(sumCloseQty);
            document.querySelector('#inv-foot-close-val').textContent = formatMoney(sumCloseVal);

        } catch (err) {
            showInvToast(err.message || 'Lỗi khi tải dữ liệu Xuất Nhập Tồn.', false);
        }
    };

    // =========================================================================
    // 2. LOAD & RENDER TAB PHIẾU NHẬP KHO
    // =========================================================================
    const loadReceiptsData = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiReceipts || '/inventory/api/receipts/';

        try {
            const resp = await fetch(apiUrl);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Lỗi tải phiếu nhập.');

            const tbody = document.querySelector('#inv-receipts-tbody');
            if (!tbody) return;

            const receipts = data.receipts || [];
            document.querySelector('#inv-tab-badge-receipts').textContent = receipts.length;

            if (!receipts.length) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 24px; color: #64748b;">Chưa có phiếu nhập kho nào. Nhấn "+ Lập phiếu nhập kho mới" để bắt đầu.</td></tr>';
                return;
            }

            tbody.innerHTML = receipts.map((r) => `
                <tr>
                    <td><strong class="text-emerald" style="letter-spacing: 0.02em;">${r.receipt_code}</strong></td>
                    <td>${r.created_at_formatted}</td>
                    <td><strong>${r.supplier}</strong></td>
                    <td class="text-center"><span class="inv-badge" style="background: #f1f5f9; color: #334155;">${r.items_count} mặt hàng</span></td>
                    <td class="text-right text-emerald text-bold">${r.total_amount_formatted}</td>
                    <td>${r.created_by}</td>
                    <td><span style="color: #64748b;">${r.note || '-'}</span></td>
                    <td class="text-center"><span class="inv-badge badge-receipt-confirmed">Đã nhập kho</span></td>
                    <td class="text-center">
                        <button type="button" class="inv-row-btn btn-view-receipt" data-id="${r.id}" title="Xem chi tiết & In phiếu">Xem / In</button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('.btn-view-receipt').forEach((btn) => {
                btn.addEventListener('click', () => openSlipViewDialog('receipt', btn.dataset.id));
            });

        } catch (err) {
            showInvToast(err.message || 'Lỗi khi tải danh sách phiếu nhập.', false);
        }
    };

    // =========================================================================
    // 3. LOAD & RENDER TAB PHIẾU XUẤT KHO
    // =========================================================================
    const loadIssuesData = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiIssues || '/inventory/api/issues/';

        try {
            const resp = await fetch(apiUrl);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Lỗi tải phiếu xuất.');

            const tbody = document.querySelector('#inv-issues-tbody');
            if (!tbody) return;

            const issues = data.issues || [];
            document.querySelector('#inv-tab-badge-issues').textContent = issues.length;

            if (!issues.length) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding: 24px; color: #64748b;">Chưa có phiếu xuất kho nào. Nhấn "+ Lập phiếu xuất kho mới" để bắt đầu.</td></tr>';
                return;
            }

            tbody.innerHTML = issues.map((iss) => `
                <tr>
                    <td><strong class="text-amber" style="letter-spacing: 0.02em;">${iss.issue_code}</strong></td>
                    <td>${iss.created_at_formatted}</td>
                    <td><span class="inv-badge badge-issue-type">${iss.issue_type_display}</span></td>
                    <td><strong>${iss.receiver}</strong></td>
                    <td class="text-center"><span class="inv-badge" style="background: #f1f5f9; color: #334155;">${iss.items_count} mặt hàng</span></td>
                    <td class="text-right text-amber text-bold">${iss.total_amount_formatted}</td>
                    <td>${iss.created_by}</td>
                    <td><span style="color: #64748b;">${iss.note || '-'}</span></td>
                    <td class="text-center">
                        <button type="button" class="inv-row-btn btn-view-issue" data-id="${iss.id}" title="Xem chi tiết & In phiếu">Xem / In</button>
                    </td>
                </tr>
            `).join('');

            tbody.querySelectorAll('.btn-view-issue').forEach((btn) => {
                btn.addEventListener('click', () => openSlipViewDialog('issue', btn.dataset.id));
            });

        } catch (err) {
            showInvToast(err.message || 'Lỗi khi tải danh sách phiếu xuất.', false);
        }
    };

    // =========================================================================
    // 4. LOAD & RENDER TAB KIỂM KÊ & CÂN ĐỐI KHO
    // =========================================================================
    const loadAdjustmentsData = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiAdjustments || '/inventory/api/adjustments/';

        const tbody = document.querySelector('#inv-adj-tbody');
        if (!tbody) return;

        if (!cachedIngredients.length) {
            await loadXntData();
        }

        tbody.innerHTML = cachedIngredients.map((ing, idx) => `
            <tr data-ingredient-id="${ing.id}" data-cost="${ing.average_cost}" data-system="${ing.current_stock}">
                <td class="text-center">${idx + 1}</td>
                <td><strong>${ing.code}</strong></td>
                <td><strong>${ing.name}</strong></td>
                <td><span style="color: #64748b;">${ing.group || '-'}</span></td>
                <td class="text-center">${ing.unit}</td>
                <td class="text-right">${ing.cost_formatted} đ</td>
                <td class="text-right text-bold system-stock-val">${ing.current_stock_formatted}</td>
                <td class="text-center">
                    <input type="number" step="0.01" class="inv-input-actual-stock" value="${ing.current_stock}" data-id="${ing.id}">
                </td>
                <td class="text-right text-bold diff-qty-val">0</td>
                <td class="text-right text-bold diff-amt-val">0 đ</td>
            </tr>
        `).join('');

        const updateDiffRow = (input) => {
            const tr = input.closest('tr');
            if (!tr) return;
            const system = Number(tr.dataset.system || 0);
            const cost = Number(tr.dataset.cost || 0);
            const actual = Number(input.value || 0);
            const diff = actual - system;
            const diffAmt = diff * cost;

            const diffQtyEl = tr.querySelector('.diff-qty-val');
            const diffAmtEl = tr.querySelector('.diff-amt-val');

            if (diff > 0) {
                diffQtyEl.textContent = `+${formatNumber(diff)}`;
                diffQtyEl.style.color = '#059669';
                diffAmtEl.textContent = `+${formatMoney(diffAmt)}`;
                diffAmtEl.style.color = '#059669';
            } else if (diff < 0) {
                diffQtyEl.textContent = formatNumber(diff);
                diffQtyEl.style.color = '#dc2626';
                diffAmtEl.textContent = formatMoney(diffAmt);
                diffAmtEl.style.color = '#dc2626';
            } else {
                diffQtyEl.textContent = '0';
                diffQtyEl.style.color = '#64748b';
                diffAmtEl.textContent = '0 đ';
                diffAmtEl.style.color = '#64748b';
            }
        };

        tbody.querySelectorAll('.inv-input-actual-stock').forEach((input) => {
            input.addEventListener('input', () => updateDiffRow(input));
        });

        // Load History
        try {
            const resp = await fetch(apiUrl);
            const data = await resp.json();
            if (data.ok && data.adjustments) {
                const histList = document.querySelector('#inv-adj-history-list');
                if (!histList) return;
                if (!data.adjustments.length) {
                    histList.innerHTML = '<p style="color: #64748b; font-size: 12px; margin: 0;">Chưa có đợt kiểm kê nào được thực hiện.</p>';
                    return;
                }
                histList.innerHTML = data.adjustments.map((a) => `
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                        <div>
                            <strong class="text-blue">${a.adjustment_code}</strong> — <span style="color: #64748b;">${a.created_at_formatted}</span>
                            <span style="margin-left: 8px; color: #334155;">(Lập bởi: ${a.created_by})</span>
                            <div style="color: #64748b; font-style: italic; margin-top: 2px;">${a.note || 'Không có ghi chú'}</div>
                        </div>
                        <div style="text-align: right;">
                            <div>Chênh lệch: <strong style="color: ${a.total_diff_amount >= 0 ? '#059669' : '#dc2626'};">${a.total_diff_amount_formatted}</strong></div>
                            <small style="color: #64748b;">${a.items_count} mặt hàng kiểm</small>
                        </div>
                    </div>
                `).join('');
            }
        } catch (e) {
            // Ignore history load error
        }
    };

    // =========================================================================
    // 5. LOAD & RENDER TAB SỔ THẺ KHO
    // =========================================================================
    const loadLedgerData = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiLedger || '/inventory/api/ledger/';

        const ingId = document.querySelector('#inv-ledger-ingredient')?.value || '';
        const txType = document.querySelector('#inv-ledger-type')?.value || '';
        const fromDate = document.querySelector('#inv-date-from')?.value || '';
        const toDate = document.querySelector('#inv-date-to')?.value || '';

        const params = new URLSearchParams({
            ingredient_id: ingId,
            type: txType,
            range: currentRangePreset,
            start_date: fromDate,
            end_date: toDate,
        });

        try {
            const resp = await fetch(`${apiUrl}?${params.toString()}`);
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Lỗi tải sổ thẻ kho.');

            const tbody = document.querySelector('#inv-ledger-tbody');
            if (!tbody) return;

            const txs = data.transactions || [];
            if (!txs.length) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="padding: 24px; color: #64748b;">Chưa có giao dịch biến động kho nào theo bộ lọc này.</td></tr>';
                return;
            }

            tbody.innerHTML = txs.map((tx) => {
                let badgeClass = 'badge-receipt-confirmed';
                let signColor = '#059669';
                if (tx.transaction_type === 'sale') {
                    badgeClass = 'bg-indigo-soft';
                    signColor = '#4338ca';
                } else if (tx.transaction_type === 'issue') {
                    badgeClass = 'bg-amber-soft';
                    signColor = '#d97706';
                } else if (tx.transaction_type === 'decrease') {
                    badgeClass = 'bg-rose-soft';
                    signColor = '#e11d48';
                }

                return `
                    <tr>
                        <td>${tx.created_at_formatted}</td>
                        <td><strong>${tx.ingredient_code}</strong></td>
                        <td><strong>${tx.ingredient_name}</strong></td>
                        <td class="text-center">${tx.unit}</td>
                        <td><span class="inv-badge ${badgeClass}">${tx.transaction_type_display}</span></td>
                        <td class="text-right text-bold" style="color: ${signColor}; font-size: 13px;">${tx.quantity_formatted}</td>
                        <td class="text-right">${tx.unit_cost_formatted} đ</td>
                        <td class="text-right text-bold text-blue">${tx.balance_after_formatted}</td>
                        <td>${tx.created_by}</td>
                        <td><span style="color: #64748b;">${tx.note || '-'}</span></td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            showInvToast(err.message || 'Lỗi khi tải sổ thẻ kho.', false);
        }
    };

    // =========================================================================
    // SUB-MODAL: LẬP PHIẾU NHẬP KHO
    // =========================================================================
    const openNewReceiptModal = () => {
        const sub = document.querySelector('#modal-inv-new-receipt');
        if (!sub) return;

        document.querySelector('#inv-rec-supplier').value = '';
        document.querySelector('#inv-rec-note').value = '';

        const tbody = document.querySelector('#inv-rec-items-tbody');
        tbody.innerHTML = '';
        addReceiptRow();
        updateReceiptTotals();

        sub.hidden = false;
    };

    const addReceiptRow = () => {
        const tbody = document.querySelector('#inv-rec-items-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.className = 'inv-item-row';

        let optionsHtml = '<option value="">-- Chọn nguyên liệu --</option>';
        cachedIngredients.forEach((ing) => {
            optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}">${ing.code} - ${ing.name} (${ing.unit})</option>`;
        });

        row.innerHTML = `
            <td>
                <select class="inv-item-row-select row-ing-select">
                    ${optionsHtml}
                </select>
            </td>
            <td class="text-center row-unit-label">-</td>
            <td>
                <input type="number" step="0.01" min="0.01" class="inv-item-row-input row-qty" value="1">
            </td>
            <td>
                <input type="number" step="1000" min="0" class="inv-item-row-input row-cost" value="0">
            </td>
            <td class="text-right text-bold text-emerald row-total-cost">0 đ</td>
            <td class="text-center">
                <button type="button" class="inv-btn-del-row" title="Xóa dòng">&times;</button>
            </td>
        `;

        tbody.appendChild(row);

        const select = row.querySelector('.row-ing-select');
        const unitLbl = row.querySelector('.row-unit-label');
        const qtyInp = row.querySelector('.row-qty');
        const costInp = row.querySelector('.row-cost');
        const totalCell = row.querySelector('.row-total-cost');
        const delBtn = row.querySelector('.inv-btn-del-row');

        const recalcRow = () => {
            const q = Number(qtyInp.value || 0);
            const c = Number(costInp.value || 0);
            totalCell.textContent = formatMoney(q * c);
            updateReceiptTotals();
        };

        select.addEventListener('change', () => {
            const opt = select.selectedOptions[0];
            if (opt && opt.value) {
                unitLbl.textContent = opt.dataset.unit || '';
                costInp.value = Math.round(Number(opt.dataset.cost || 0));
            } else {
                unitLbl.textContent = '-';
            }
            recalcRow();
        });

        qtyInp.addEventListener('input', recalcRow);
        costInp.addEventListener('input', recalcRow);

        delBtn.addEventListener('click', () => {
            row.remove();
            updateReceiptTotals();
        });
    };

    const updateReceiptTotals = () => {
        let total = 0;
        document.querySelectorAll('#inv-rec-items-tbody tr').forEach((tr) => {
            const q = Number(tr.querySelector('.row-qty')?.value || 0);
            const c = Number(tr.querySelector('.row-cost')?.value || 0);
            total += (q * c);
        });
        document.querySelector('#inv-rec-total-amount').textContent = formatMoney(total);
    };

    const submitReceiptForm = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiReceipts || '/inventory/api/receipts/';

        const supplier = document.querySelector('#inv-rec-supplier')?.value || '';
        const note = document.querySelector('#inv-rec-note')?.value || '';

        const items = [];
        document.querySelectorAll('#inv-rec-items-tbody tr').forEach((tr) => {
            const ingId = tr.querySelector('.row-ing-select')?.value;
            const q = Number(tr.querySelector('.row-qty')?.value || 0);
            const c = Number(tr.querySelector('.row-cost')?.value || 0);
            if (ingId && q > 0) {
                items.push({ ingredient_id: parseInt(ingId), quantity: q, unit_cost: c });
            }
        });

        if (!items.length) {
            alert('Vui lòng chọn ít nhất một mặt hàng và nhập số lượng hợp lệ.');
            return;
        }

        const btn = document.querySelector('#inv-rec-btn-submit');
        btn.disabled = true;
        btn.textContent = 'Đang xử lý...';

        try {
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ supplier, note, items }),
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'Không thể tạo phiếu nhập.');

            showInvToast(data.message || 'Đã tạo và nhập kho thành công!');
            document.querySelector('#modal-inv-new-receipt').hidden = true;

            // Refresh data
            loadXntData();
            loadReceiptsData();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Xác nhận nhập kho';
        }
    };

    // =========================================================================
    // SUB-MODAL: LẬP PHIẾU XUẤT KHO
    // =========================================================================
    const openNewIssueModal = () => {
        const sub = document.querySelector('#modal-inv-new-issue');
        if (!sub) return;

        document.querySelector('#inv-iss-receiver').value = 'Bếp chính';
        document.querySelector('#inv-iss-note').value = '';

        const tbody = document.querySelector('#inv-iss-items-tbody');
        tbody.innerHTML = '';
        addIssueRow();
        updateIssueTotals();

        sub.hidden = false;
    };

    const addIssueRow = () => {
        const tbody = document.querySelector('#inv-iss-items-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.className = 'inv-item-row';

        let optionsHtml = '<option value="">-- Chọn nguyên liệu --</option>';
        cachedIngredients.forEach((ing) => {
            optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-stock="${ing.current_stock}" data-unit="${ing.unit}">${ing.code} - ${ing.name} (Tồn: ${ing.current_stock_formatted} ${ing.unit})</option>`;
        });

        row.innerHTML = `
            <td>
                <select class="inv-item-row-select row-ing-select">
                    ${optionsHtml}
                </select>
            </td>
            <td class="text-center row-unit-label">-</td>
            <td class="text-right text-bold text-blue row-stock-avail">0</td>
            <td>
                <input type="number" step="0.01" min="0.01" class="inv-item-row-input row-qty" value="1">
            </td>
            <td class="text-right row-cost-label">0 đ</td>
            <td class="text-right text-bold text-amber row-total-cost">0 đ</td>
            <td class="text-center">
                <button type="button" class="inv-btn-del-row" title="Xóa dòng">&times;</button>
            </td>
        `;

        tbody.appendChild(row);

        const select = row.querySelector('.row-ing-select');
        const unitLbl = row.querySelector('.row-unit-label');
        const stockLbl = row.querySelector('.row-stock-avail');
        const costLbl = row.querySelector('.row-cost-label');
        const qtyInp = row.querySelector('.row-qty');
        const totalCell = row.querySelector('.row-total-cost');
        const delBtn = row.querySelector('.inv-btn-del-row');

        let currentCost = 0;
        let currentStock = 0;

        const recalcRow = () => {
            const q = Number(qtyInp.value || 0);
            if (q > currentStock) {
                qtyInp.style.borderColor = '#dc2626';
                qtyInp.title = 'Số lượng xuất vượt quá tồn kho!';
            } else {
                qtyInp.style.borderColor = '#cbd5e1';
                qtyInp.title = '';
            }
            totalCell.textContent = formatMoney(q * currentCost);
            updateIssueTotals();
        };

        select.addEventListener('change', () => {
            const opt = select.selectedOptions[0];
            if (opt && opt.value) {
                unitLbl.textContent = opt.dataset.unit || '';
                currentStock = Number(opt.dataset.stock || 0);
                currentCost = Number(opt.dataset.cost || 0);
                stockLbl.textContent = formatNumber(currentStock);
                costLbl.textContent = formatMoney(currentCost);
            } else {
                unitLbl.textContent = '-';
                stockLbl.textContent = '0';
                costLbl.textContent = '0 đ';
                currentCost = 0;
                currentStock = 0;
            }
            recalcRow();
        });

        qtyInp.addEventListener('input', recalcRow);
        delBtn.addEventListener('click', () => {
            row.remove();
            updateIssueTotals();
        });
    };

    const updateIssueTotals = () => {
        let total = 0;
        document.querySelectorAll('#inv-iss-items-tbody tr').forEach((tr) => {
            const opt = tr.querySelector('.row-ing-select')?.selectedOptions[0];
            const cost = Number(opt?.dataset.cost || 0);
            const q = Number(tr.querySelector('.row-qty')?.value || 0);
            total += (q * cost);
        });
        document.querySelector('#inv-iss-total-amount').textContent = formatMoney(total);
    };

    const submitIssueForm = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiIssues || '/inventory/api/issues/';

        const issueType = document.querySelector('#inv-iss-type')?.value || 'manual';
        const receiver = document.querySelector('#inv-iss-receiver')?.value || '';
        const note = document.querySelector('#inv-iss-note')?.value || '';

        const items = [];
        let hasOverStock = false;

        document.querySelectorAll('#inv-iss-items-tbody tr').forEach((tr) => {
            const opt = tr.querySelector('.row-ing-select')?.selectedOptions[0];
            const ingId = opt?.value;
            const stock = Number(opt?.dataset.stock || 0);
            const q = Number(tr.querySelector('.row-qty')?.value || 0);
            if (ingId && q > 0) {
                if (q > stock) hasOverStock = true;
                items.push({ ingredient_id: parseInt(ingId), quantity: q });
            }
        });

        if (!items.length) {
            alert('Vui lòng chọn ít nhất một mặt hàng và nhập số lượng xuất hợp lệ.');
            return;
        }

        if (hasOverStock) {
            alert('Có mặt hàng có số lượng xuất lớn hơn số lượng tồn trong kho. Vui lòng kiểm tra lại!');
            return;
        }

        const btn = document.querySelector('#inv-iss-btn-submit');
        btn.disabled = true;
        btn.textContent = 'Đang xử lý...';

        try {
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ issue_type: issueType, receiver, note, items }),
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'Không thể tạo phiếu xuất.');

            showInvToast(data.message || 'Đã tạo và xuất kho thành công!');
            document.querySelector('#modal-inv-new-issue').hidden = true;

            // Refresh data
            loadXntData();
            loadIssuesData();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Xác nhận xuất kho';
        }
    };

    // =========================================================================
    // SUBMIT KIỂM KÊ CÂN ĐỐI KHO
    // =========================================================================
    const submitAdjustment = async () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const apiUrl = modal?.dataset.apiAdjustments || '/inventory/api/adjustments/';

        const note = document.querySelector('#inv-adj-note')?.value || 'Kiểm kê cân đối kho';
        const items = [];

        document.querySelectorAll('#inv-adj-tbody tr').forEach((tr) => {
            const id = tr.dataset.ingredientId;
            const input = tr.querySelector('.inv-input-actual-stock');
            if (id && input) {
                items.push({
                    ingredient_id: parseInt(id),
                    actual_stock: parseFloat(input.value) || 0,
                });
            }
        });

        if (!items.length) {
            alert('Không có dữ liệu mặt hàng để kiểm kê.');
            return;
        }

        const btn = document.querySelector('#inv-btn-save-adj');
        btn.disabled = true;
        btn.textContent = 'Đang lưu cân đối...';

        try {
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ note, items }),
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok) throw new Error(data.error || 'Không thể cân đối tồn kho.');

            showInvToast(data.message || 'Đã cân đối và cập nhật tồn kho thành công!');
            loadXntData();
            loadAdjustmentsData();
        } catch (err) {
            alert(err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Xác nhận cân đối tồn kho';
        }
    };

    // =========================================================================
    // XEM CHI TIẾT & IN PHIẾU
    // =========================================================================
    const openSlipViewDialog = async (type, id) => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const slipModal = document.querySelector('#modal-inv-view-slip');
        const printArea = document.querySelector('#inv-slip-print-area');
        const titleEl = document.querySelector('#inv-slip-title');
        if (!slipModal || !printArea) return;

        let url = '';
        if (type === 'receipt') {
            url = `${modal.dataset.apiReceipts || '/inventory/api/receipts/'}?receipt_id=${id}`;
            titleEl.textContent = 'Phiếu Nhập Kho Nguyên Liệu';
        } else {
            url = `${modal.dataset.apiIssues || '/inventory/api/issues/'}?issue_id=${id}`;
            titleEl.textContent = 'Phiếu Xuất Kho Nguyên Liệu';
        }

        printArea.innerHTML = '<div style="text-align: center; padding: 30px; color: #64748b;">Đang tải thông tin phiếu...</div>';
        slipModal.hidden = false;

        try {
            const resp = await fetch(url);
            const data = await resp.json();
            if (!data.ok) throw new Error('Không thể tải phiếu.');

            const slip = type === 'receipt' ? data.receipt : data.issue;
            const items = slip.items || [];

            let rowsHtml = items.map((it, idx) => `
                <tr>
                    <td style="text-align: center; padding: 6px 8px; border: 1px solid #cbd5e1;">${idx + 1}</td>
                    <td style="padding: 6px 8px; border: 1px solid #cbd5e1;"><strong>${it.ingredient_code}</strong></td>
                    <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${it.ingredient_name}</td>
                    <td style="text-align: center; padding: 6px 8px; border: 1px solid #cbd5e1;">${it.unit}</td>
                    <td style="text-align: right; padding: 6px 8px; border: 1px solid #cbd5e1;"><strong>${it.quantity_formatted}</strong></td>
                    <td style="text-align: right; padding: 6px 8px; border: 1px solid #cbd5e1;">${it.unit_cost_formatted} đ</td>
                    <td style="text-align: right; padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${it.total_cost_formatted} đ</td>
                </tr>
            `).join('');

            const headerTarget = type === 'receipt'
                ? `<div><strong>Nhà cung cấp:</strong> ${slip.supplier}</div>`
                : `<div><strong>Loại xuất:</strong> ${slip.issue_type_display}</div><div><strong>Người / Bộ phận nhận:</strong> ${slip.receiver}</div>`;

            printArea.innerHTML = `
                <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px;">
                    <h2 style="margin: 0 0 4px; font-size: 19px; text-transform: uppercase;">MIXFOOD RESTAURANT & CAFE</h2>
                    <p style="margin: 0; font-size: 12px; color: #64748b;">Phần mềm quản lý bán hàng & kho hàng MixFood POS</p>
                    <h3 style="margin: 12px 0 4px; font-size: 16px; text-transform: uppercase; color: #1e293b;">
                        ${type === 'receipt' ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}
                    </h3>
                    <div style="font-size: 12.5px; font-weight: 700; color: #2563eb;">Số: ${type === 'receipt' ? slip.receipt_code : slip.issue_code}</div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12.5px; margin-bottom: 14px;">
                    <div><strong>Ngày lập:</strong> ${slip.created_at_formatted}</div>
                    <div><strong>Người lập phiếu:</strong> ${slip.created_by}</div>
                    ${headerTarget}
                    <div style="grid-column: span 2;"><strong>Ghi chú:</strong> ${slip.note || 'Không có'}</div>
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 14px;">
                    <thead>
                        <tr style="background: #f1f5f9;">
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 40px;">STT</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 85px;">Mã</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1;">Tên mặt hàng</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 55px;">ĐVT</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 75px; text-align: right;">SL</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 85px; text-align: right;">Đơn giá</th>
                            <th style="padding: 6px; border: 1px solid #cbd5e1; width: 100px; text-align: right;">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f8fafc; font-weight: bold;">
                            <td colspan="6" style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">TỔNG CỘNG:</td>
                            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; color: #1e293b; font-size: 13.5px;">${slip.total_amount_formatted}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 24px; font-size: 12px;">
                    <div>
                        <strong>Người lập phiếu</strong>
                        <div style="margin-top: 45px; font-style: italic;">(Ký, ghi rõ họ tên)</div>
                    </div>
                    <div>
                        <strong>${type === 'receipt' ? 'Người giao hàng' : 'Người nhận hàng'}</strong>
                        <div style="margin-top: 45px; font-style: italic;">(Ký, ghi rõ họ tên)</div>
                    </div>
                    <div>
                        <strong>Thủ kho / Quản lý</strong>
                        <div style="margin-top: 45px; font-style: italic;">(Ký, ghi rõ họ tên)</div>
                    </div>
                </div>
            `;

        } catch (err) {
            printArea.innerHTML = `<div style="text-align: center; padding: 30px; color: #dc2626;">${err.message || 'Lỗi khi tải phiếu.'}</div>`;
        }
    };

    // =========================================================================
    // EXCEL EXPORT
    // =========================================================================
    const exportExcelXnt = () => {
        const modal = document.querySelector('#modal-inventory-manager') || document.querySelector('.inv-manager-dialog');
        const exportUrl = modal?.dataset.urlExport || '/inventory/export/';

        const fromDate = document.querySelector('#inv-date-from')?.value || '';
        const toDate = document.querySelector('#inv-date-to')?.value || '';
        const group = document.querySelector('#inv-select-group')?.value || '';
        const query = document.querySelector('#inv-search-query')?.value || '';
        const lowStockOnly = document.querySelector('#inv-chk-low-stock')?.checked ? '1' : '0';

        const params = new URLSearchParams({
            range: currentRangePreset,
            start_date: fromDate,
            end_date: toDate,
            group: group,
            q: query,
            low_stock_only: lowStockOnly,
        });

        window.location.href = `${exportUrl}?${params.toString()}`;
    };

    // =========================================================================
    // OPEN POS INVENTORY MODAL (GLOBAL EXPORT)
    // =========================================================================
    window.openPosInventoryModal = (targetTab = 'xnt') => {
        const modal = document.querySelector('#modal-inventory-manager');
        if (!modal) return;

        const doOpen = () => {
            modal.hidden = false;
            switchTab(targetTab);
        };

        if (typeof window.requirePosPermission === 'function') {
            window.requirePosPermission('manage_inventory', doOpen, 'Quản lý kho hàng & Xuất Nhập Tồn');
        } else {
            doOpen();
        }
    };

    const switchTab = (tabName) => {
        currentActiveTab = tabName;
        document.querySelectorAll('.inv-tab-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.inv-tab-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.id === `inv-panel-${tabName}`);
        });

        if (tabName === 'xnt') loadXntData();
        else if (tabName === 'receipts') loadReceiptsData();
        else if (tabName === 'issues') loadIssuesData();
        else if (tabName === 'adjustments') loadAdjustmentsData();
        else if (tabName === 'ledger') loadLedgerData();
    };

    // =========================================================================
    // DOM READY INITIALIZATION
    // =========================================================================
    document.addEventListener('DOMContentLoaded', () => {
        // Tab switching clicks
        document.querySelectorAll('.inv-tab-btn').forEach((btn) => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Date Preset buttons
        document.querySelectorAll('.inv-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.inv-preset-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentRangePreset = btn.dataset.preset;
                loadXntData();
            });
        });

        // Apply Custom Dates button
        document.querySelector('#inv-btn-apply-dates')?.addEventListener('click', () => {
            document.querySelectorAll('.inv-preset-btn').forEach((b) => b.classList.remove('active'));
            currentRangePreset = 'custom';
            loadXntData();
        });

        // Filter triggers
        document.querySelector('#inv-select-group')?.addEventListener('change', loadXntData);
        document.querySelector('#inv-chk-low-stock')?.addEventListener('change', loadXntData);

        let searchDebounce = null;
        document.querySelector('#inv-search-query')?.addEventListener('input', () => {
            window.clearTimeout(searchDebounce);
            searchDebounce = window.setTimeout(loadXntData, 350);
        });

        // Header Top Actions
        document.querySelector('#inv-top-btn-receipt')?.addEventListener('click', openNewReceiptModal);
        document.querySelector('#inv-top-btn-issue')?.addEventListener('click', openNewIssueModal);
        document.querySelector('#inv-top-btn-adj')?.addEventListener('click', () => switchTab('adjustments'));
        document.querySelector('#inv-top-btn-export')?.addEventListener('click', exportExcelXnt);

        document.querySelector('#inv-btn-create-receipt')?.addEventListener('click', openNewReceiptModal);
        document.querySelector('#inv-btn-create-issue')?.addEventListener('click', openNewIssueModal);

        // Sub-modal receipts
        document.querySelector('#inv-rec-btn-add-row')?.addEventListener('click', addReceiptRow);
        document.querySelector('#inv-rec-btn-submit')?.addEventListener('click', submitReceiptForm);
        document.querySelector('#inv-rec-btn-cancel')?.addEventListener('click', () => {
            document.querySelector('#modal-inv-new-receipt').hidden = true;
        });
        document.querySelector('#inv-receipt-modal-close')?.addEventListener('click', () => {
            document.querySelector('#modal-inv-new-receipt').hidden = true;
        });

        // Sub-modal issues
        document.querySelector('#inv-iss-btn-add-row')?.addEventListener('click', addIssueRow);
        document.querySelector('#inv-iss-btn-submit')?.addEventListener('click', submitIssueForm);
        document.querySelector('#inv-iss-btn-cancel')?.addEventListener('click', () => {
            document.querySelector('#modal-inv-new-issue').hidden = true;
        });
        document.querySelector('#inv-issue-modal-close')?.addEventListener('click', () => {
            document.querySelector('#modal-inv-new-issue').hidden = true;
        });

        // Adjustments submit & reset
        document.querySelector('#inv-btn-save-adj')?.addEventListener('click', submitAdjustment);
        document.querySelector('#inv-btn-reset-adj')?.addEventListener('click', loadAdjustmentsData);

        // Ledger filter
        document.querySelector('#inv-btn-ledger-filter')?.addEventListener('click', loadLedgerData);

        // Print slip dialog
        document.querySelector('#inv-slip-btn-print')?.addEventListener('click', () => {
            window.print();
        });
        document.querySelector('#inv-slip-modal-close')?.addEventListener('click', () => {
            document.querySelector('#modal-inv-view-slip').hidden = true;
        });

        // Close Main Modal
        document.querySelector('#inv-modal-close')?.addEventListener('click', () => {
            const m = document.querySelector('#modal-inventory-manager');
            if (m) m.hidden = true;
        });

        // Close on backdrop click
        document.querySelector('#modal-inventory-manager')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-inventory-manager') {
                e.target.hidden = true;
            }
        });

        // Trigger open from POS menu
        document.querySelectorAll('#open-inventory-manager-menu, #open-inventory-report-menu, [data-open-inventory]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.pos-menu-item').forEach((item) => {
                    item.classList.remove('open');
                    const b = item.querySelector('.nav-menu-btn') || item.querySelector(':scope > button');
                    if (b) b.setAttribute('aria-expanded', 'false');
                });
                const targetTab = btn.id === 'open-inventory-report-menu' ? 'xnt' : 'xnt';
                window.openPosInventoryModal(targetTab);
            });
        });

        // Escape key handling
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const subSlip = document.querySelector('#modal-inv-view-slip');
                if (subSlip && !subSlip.hidden) { subSlip.hidden = true; return; }
                const subRec = document.querySelector('#modal-inv-new-receipt');
                if (subRec && !subRec.hidden) { subRec.hidden = true; return; }
                const subIss = document.querySelector('#modal-inv-new-issue');
                if (subIss && !subIss.hidden) { subIss.hidden = true; return; }
                const m = document.querySelector('#modal-inventory-manager');
                if (m && !m.hidden && !m.classList.contains('inv-embedded-page')) { m.hidden = true; }
            }
        });

        // If on standalone page /inventory/
        if (document.body.classList.contains('page-inventory-home') || document.querySelector('.inv-standalone-container')) {
            loadXntData();
        }
    });

})();
