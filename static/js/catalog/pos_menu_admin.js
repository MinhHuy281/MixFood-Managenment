// # File này chịu trách nhiệm điều khiển thanh Menu điều hướng trên màn hình POS và xử lý hộp thoại Quản lý Thực đơn (Menu Admin Modal) ngay trên POS.
// Navbar dropdown 1-click open, 2-click close controller (guaranteed inline execution)
    (function initNavDropdowns() {
        document.querySelectorAll('.pos-menu-item').forEach((item) => {
            const btn = item.querySelector('button.nav-menu-btn') || item.querySelector(':scope > button');
            if (!btn) return;
            btn.onclick = function(e) {
                e.preventDefault();
                e.stopPropagation();
                const wasOpen = item.classList.contains('open');
                document.querySelectorAll('.pos-menu-item').forEach((other) => {
                    other.classList.remove('open');
                    const b = other.querySelector('button.nav-menu-btn') || other.querySelector(':scope > button');
                    if (b) b.setAttribute('aria-expanded', 'false');
                });
                if (!wasOpen) {
                    item.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            };
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.pos-menu-item')) {
                document.querySelectorAll('.pos-menu-item').forEach((item) => {
                    item.classList.remove('open');
                    const b = item.querySelector('button.nav-menu-btn') || item.querySelector(':scope > button');
                    if (b) b.setAttribute('aria-expanded', 'false');
                });
            }
        });
    })();
    // Live clock update
    (function updateClock() {
        const el = document.getElementById('live-clock');
        if (el) {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            el.textContent = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        }
        setTimeout(updateClock, 1000);
    })();

    // Invoice Report Modal Controller
    (function initInvoiceReport() {
        const dialog = document.getElementById('invoice-report-dialog');
        if (!dialog) return;

        const closeBtn = document.getElementById('invoice-report-close');
        const backdrop = document.getElementById('invoice-report-backdrop');
        const filterBtn = document.getElementById('inv-filter-btn');
        const exportBtn = document.getElementById('inv-btn-export-excel');
        const tbody = document.getElementById('inv-report-rows');

        const dateFrom = document.getElementById('inv-filter-from');
        const dateTo = document.getElementById('inv-filter-to');
        const cashierSelect = document.getElementById('inv-filter-cashier');
        const paymentSelect = document.getElementById('inv-filter-payment');
        const areaSelect = document.getElementById('inv-filter-area');
        const tableSelect = document.getElementById('inv-filter-table');
        const statusSelect = document.getElementById('inv-filter-status');
        const noPaginateCheck = document.getElementById('inv-filter-no-paginate');
        const showNamesCheck = document.getElementById('inv-filter-show-names');

        const btnFirst = document.getElementById('inv-btn-first');
        const btnPrev = document.getElementById('inv-btn-prev');
        const btnNext = document.getElementById('inv-btn-next');
        const btnLast = document.getElementById('inv-btn-last');
        const pageStatus = document.getElementById('inv-page-status');

        const sumLine1 = document.getElementById('inv-sum-line-1');
        const sumLine2 = document.getElementById('inv-sum-line-2');

        let currentPage = 1;
        let totalPages = 1;

        function buildQueryParams(page = 1, exportFormat = '') {
            const params = new URLSearchParams();
            if (exportFormat) params.append('export', exportFormat);
            else params.append('format', 'json');

            params.append('page', page);
            if (dateFrom && dateFrom.value) params.append('date_from', dateFrom.value);
            if (dateTo && dateTo.value) params.append('date_to', dateTo.value);
            if (cashierSelect && cashierSelect.value !== 'all') params.append('cashier', cashierSelect.value);
            if (paymentSelect && paymentSelect.value !== 'all') params.append('payment_method', paymentSelect.value);
            if (areaSelect && areaSelect.value !== 'all') params.append('area', areaSelect.value);
            if (tableSelect && tableSelect.value !== 'all') params.append('table', tableSelect.value);
            if (statusSelect) params.append('status', statusSelect.value);
            if (noPaginateCheck && noPaginateCheck.checked) params.append('no_paginate', '1');
            if (showNamesCheck && showNamesCheck.checked) params.append('show_full_name', '1');
            return params.toString();
        }

        async function fetchReport(page = 1) {
            if (!dialog.dataset.url) return;
            currentPage = page;
            tbody.innerHTML = '<tr><td colspan="13" class="report-loading-cell"><div class="spinner-inline"></div> Đang tải dữ liệu báo cáo...</td></tr>';

            try {
                const qs = buildQueryParams(page);
                const res = await fetch(`${dialog.dataset.url}?${qs}`, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
                const data = await res.json();
                if (!data.ok) throw new Error('Không thể tải dữ liệu hóa đơn.');

                renderRows(data.invoices, showNamesCheck ? showNamesCheck.checked : false);
                updateSummary(data.summary);
                updatePagination(data.pagination);
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="13" class="report-error-cell">⚠️ ${err.message || 'Lỗi kết nối khi tải báo cáo.'}</td></tr>`;
            }
        }

        function renderRows(invoices, showFullNames) {
            if (!invoices || !invoices.length) {
                tbody.innerHTML = '<tr><td colspan="14" class="empty-invoices-notice"><div class="empty-notice-box"><span>🧾</span><p>Không có hóa đơn nào thỏa mãn điều kiện lọc.</p></div></td></tr>';
                return;
            }

            tbody.innerHTML = invoices.map(inv => {
                const itemsDisplay = showFullNames ? (inv.items_full || '-') : (inv.items_short || '-');
                const rowClass = inv.status === 'cancelled' ? 'row-cancelled' : '';
                return `
                    <tr class="${rowClass} invoice-row-clickable" data-code="${inv.invoice_code}" title="Nhấp đúp hoặc bấm Sửa để chỉnh sửa hóa đơn #${inv.invoice_code}">
                        <td><strong class="invoice-code-badge">#${inv.invoice_code}</strong></td>
                        <td class="text-muted">${inv.time}</td>
                        <td><span class="user-chip-cell">${inv.cashier}</span></td>
                        <td class="text-right">${inv.subtotal_formatted}</td>
                        <td class="text-right text-muted">0</td>
                        <td class="text-right text-muted">${inv.surcharge || 0}</td>
                        <td class="text-right text-discount">${inv.discount ? ('-' + inv.discount_formatted) : '0'}</td>
                        <td class="text-right text-muted">${inv.tax || 0}</td>
                        <td class="text-right"><strong class="total-highlight">${inv.total_amount_formatted}</strong></td>
                        <td><span class="payment-method-badge">${inv.payment_method}</span></td>
                        <td><span class="area-pill">${inv.area}</span></td>
                        <td><span class="table-pill">${inv.table}</span></td>
                        <td class="items-notes-cell" title="${inv.items_full || ''}">${itemsDisplay}</td>
                        <td class="text-center" style="width: 135px; white-space: nowrap;">
                            <button type="button" class="btn-inv-row-edit btn-inv-row-print" data-code="${inv.invoice_code}" title="In lại hóa đơn #${inv.invoice_code}" style="margin-right: 4px; background: #ecfdf5; color: #059669; border-color: #a7f3d0;">
                                🖨️ In
                            </button>
                            <button type="button" class="btn-inv-row-edit" data-code="${inv.invoice_code}" title="Sửa hóa đơn #${inv.invoice_code}">
                                ✏️ Sửa
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            // Attach event listeners for editing & reprinting invoice
            tbody.querySelectorAll('.invoice-row-clickable').forEach(tr => {
                const code = tr.dataset.code;
                tr.addEventListener('dblclick', () => {
                    if (window.openInvoiceEditor) window.openInvoiceEditor(code);
                });
            });

            tbody.querySelectorAll('.btn-inv-row-print').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = btn.dataset.code;
                    const doReprint = () => {
                        if (typeof window.reprintPosInvoiceByCode === 'function') {
                            window.reprintPosInvoiceByCode(code);
                        } else {
                            window.open(`/sales/invoices/print/${encodeURIComponent(code)}/`, '_blank', 'noopener');
                        }
                    };
                    if (typeof window.requirePosPermission === 'function') {
                        window.requirePosPermission('reprint_invoice', doReprint, 'In lại hóa đơn');
                    } else {
                        doReprint();
                    }
                });
            });

            tbody.querySelectorAll('.btn-inv-row-edit:not(.btn-inv-row-print)').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = btn.dataset.code;
                    if (window.openInvoiceEditor) window.openInvoiceEditor(code);
                });
            });
        }

        window.refreshInvoiceReportTable = function() {
            fetchReport(currentPage);
        };

        function updateSummary(sum) {
            if (!sum) return;
            sumLine1.innerHTML = `<strong>${sum.total_count}</strong> hóa đơn, doanh thu: <strong>${sum.total_revenue_formatted}</strong>`;
            sumLine2.innerHTML = `<strong>${sum.discount_count}</strong> giảm giá (0 mã giảm, 0 thẻ vip, 0 tặng món) giảm <strong>${sum.discount_total_formatted}</strong>`;
        }

        function updatePagination(pag) {
            if (!pag) return;
            currentPage = pag.current_page;
            totalPages = pag.total_pages || 1;
            pageStatus.textContent = `Trang ${currentPage} / ${totalPages}`;

            btnFirst.disabled = currentPage <= 1;
            btnPrev.disabled = !pag.has_previous;
            btnNext.disabled = !pag.has_next;
            btnLast.disabled = currentPage >= totalPages;
        }

        function openDialog() {
            dialog.hidden = false;
            fetchReport(1);
        }

        function closeDialog() {
            dialog.hidden = true;
        }

        // Attach open triggers
        const menuLink = document.getElementById('open-invoice-report-menu');
        if (menuLink) {
            menuLink.addEventListener('click', (e) => {
                e.preventDefault();
                const parentMenu = menuLink.closest('.pos-menu-item');
                if (parentMenu) parentMenu.classList.remove('open');
                openDialog();
            });
        }

        const detailMenuLink = document.getElementById('open-invoice-report-menu-detail');
        if (detailMenuLink) {
            detailMenuLink.addEventListener('click', (e) => {
                e.preventDefault();
                const parentMenu = detailMenuLink.closest('.pos-menu-item');
                if (parentMenu) parentMenu.classList.remove('open');
                openDialog();
            });
        }

        const tabInvoices = document.querySelector('.record-tab');
        if (tabInvoices) {
            tabInvoices.addEventListener('dblclick', (e) => {
                e.preventDefault();
                openDialog();
            });
        }

        // Controls
        if (closeBtn) closeBtn.addEventListener('click', closeDialog);
        if (backdrop) backdrop.addEventListener('click', closeDialog);
        if (filterBtn) filterBtn.addEventListener('click', () => fetchReport(1));
        if (showNamesCheck) {
            showNamesCheck.addEventListener('change', () => fetchReport(currentPage));
        }
        if (noPaginateCheck) {
            noPaginateCheck.addEventListener('change', () => fetchReport(1));
        }

        if (btnFirst) btnFirst.addEventListener('click', () => fetchReport(1));
        if (btnPrev) btnPrev.addEventListener('click', () => { if (currentPage > 1) fetchReport(currentPage - 1); });
        if (btnNext) btnNext.addEventListener('click', () => { if (currentPage < totalPages) fetchReport(currentPage + 1); });
        if (btnLast) btnLast.addEventListener('click', () => fetchReport(totalPages));

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const qs = buildQueryParams(currentPage, 'excel');
                window.location.href = `${dialog.dataset.url}?${qs}`;
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !dialog.hidden) closeDialog();
        });
    })();

    // Menu Admin Modal Controller
    (function initMenuAdminModal() {
        const dialog = document.getElementById('menu-admin-dialog');
        if (!dialog) return;

        const closeBtn = document.getElementById('menu-admin-close');
        const backdrop = document.getElementById('menu-admin-backdrop');
        const openLink = document.getElementById('open-menu-admin-menu');

        let selectedCatId = 'all';
        let selectedDishRow = null;
        let selectedCatPill = null;

        const tableTbody = document.getElementById('modal-dishes-tbody');
        const searchInput = document.getElementById('modal-dish-search');
        const catLabel = document.getElementById('modal-dish-cat-label');
        const countBadge = document.getElementById('modal-dishes-count-badge');

        const btnAddDish = document.getElementById('modal-btn-dish-add');
        const btnEditDish = document.getElementById('modal-btn-dish-edit');
        const btnDelDish = document.getElementById('modal-btn-dish-del');

        const btnCatAdd = document.getElementById('modal-btn-cat-add');
        const btnCatEdit = document.getElementById('modal-btn-cat-edit');
        const btnCatDel = document.getElementById('modal-btn-cat-del');

        const form = document.getElementById('modal-dish-form');
        const formId = document.getElementById('modal-form-dish-id');
        const formCat = document.getElementById('modal-form-cat');
        const formSubgroup = document.getElementById('modal-form-subgroup');
        const formCode = document.getElementById('modal-form-code');
        const formName = document.getElementById('modal-form-name');
        const formUnit = document.getElementById('modal-form-unit');
        const formPrice = document.getElementById('modal-form-price');
        const formPrice2 = document.getElementById('modal-form-price-2');
        const formPrice3 = document.getElementById('modal-form-price-3');
        const formType = document.getElementById('modal-form-type');
        const formReason = document.getElementById('modal-form-reason');
        const formAutoRecipe = document.getElementById('modal-form-auto-recipe');
        const formTitle = document.getElementById('modal-form-title');
        const formMode = document.getElementById('modal-form-mode');
        const btnCancelDish = document.getElementById('modal-btn-cancel-dish');

        function openModal() {
            dialog.hidden = false;
            document.body.classList.add('modal-open');
            resetDishForm();
        }

        function closeModal() {
            dialog.hidden = true;
            document.body.classList.remove('modal-open');
        }

        if (openLink) {
            openLink.addEventListener('click', (e) => {
                e.preventDefault();
                openModal();
            });
        }
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (backdrop) backdrop.addEventListener('click', closeModal);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !dialog.hidden) closeModal();
        });

        // Filter dishes
        function filterDishes() {
            const query = (searchInput.value || '').toLowerCase().trim();
            const rows = tableTbody.querySelectorAll('.dish-row');
            let count = 0;

            rows.forEach(row => {
                const catId = row.dataset.catId;
                const code = (row.dataset.code || '').toLowerCase();
                const name = (row.dataset.name || '').toLowerCase();
                const sub = (row.dataset.subgroup || '').toLowerCase();

                const matchCat = (selectedCatId === 'all' || catId === selectedCatId);
                const matchQuery = (!query || code.includes(query) || name.includes(query) || sub.includes(query));

                if (matchCat && matchQuery) {
                    row.hidden = false;
                    count++;
                } else {
                    row.hidden = true;
                }
            });
            if (countBadge) countBadge.textContent = `${count} món`;
        }

        // Category pills
        document.querySelectorAll('#modal-categories-pills .cat-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                document.querySelectorAll('#modal-categories-pills .cat-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                selectedCatId = pill.dataset.catId;
                selectedCatPill = pill;

                if (selectedCatId === 'all') {
                    if (catLabel) catLabel.textContent = '[Tất cả]';
                    if (btnCatEdit) btnCatEdit.disabled = true;
                    if (btnCatDel) btnCatDel.disabled = true;
                } else {
                    if (catLabel) catLabel.textContent = `[${pill.dataset.catName}]`;
                    if (btnCatEdit) btnCatEdit.disabled = false;
                    if (btnCatDel) btnCatDel.disabled = false;
                    if (formCat) formCat.value = selectedCatId;
                }
                filterDishes();
            });
        });

        if (searchInput) searchInput.addEventListener('input', filterDishes);

        const btnSwitchAdd = document.getElementById('modal-btn-switch-add');
        if (btnSwitchAdd) btnSwitchAdd.addEventListener('click', resetDishForm);

        // Helper format VND (ví dụ 15.000, 100.000, 0)
        function formatVND(value) {
            if (value === null || value === undefined || value === '') return '0';
            const num = Math.round(Number(String(value).replace(/\./g, '').replace(/,/g, '')) || 0);
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }

        // Setup live price inputs formatting
        function setupPriceInput(input) {
            if (!input) return;
            input.addEventListener('input', () => {
                const raw = input.value.replace(/\D/g, '');
                if (!raw) {
                    input.value = '0';
                    return;
                }
                const num = parseInt(raw, 10);
                input.value = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            });
            input.addEventListener('focus', () => {
                if (input.value === '0') input.select();
            });
        }
        setupPriceInput(formPrice);
        setupPriceInput(formPrice2);
        setupPriceInput(formPrice3);

        // Sort rows alphabetically by name (A -> B -> C ...)
        function sortDishRows() {
            const rows = Array.from(tableTbody.querySelectorAll('.dish-row'));
            rows.sort((a, b) => {
                const nameA = (a.dataset.name || '').trim();
                const nameB = (b.dataset.name || '').trim();
                return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
            });
            rows.forEach(r => tableTbody.appendChild(r));
        }

        // Sort POS column 3 dish grid by subgroup first then alphabetically
        function sortDishGrid() {
            const dishGrid = document.getElementById('dish-grid');
            if (!dishGrid) return;
            const buttons = Array.from(dishGrid.querySelectorAll('.dish'));
            buttons.sort((a, b) => {
                const subA = (a.dataset.subgroup || '').trim();
                const subB = (b.dataset.subgroup || '').trim();
                if (subA !== subB) {
                    if (!subA) return -1;
                    if (!subB) return 1;
                    return subA.localeCompare(subB, 'vi', { sensitivity: 'base' });
                }
                const nameA = (a.dataset.dish || '').trim();
                const nameB = (b.dataset.dish || '').trim();
                return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
            });
            buttons.forEach(b => dishGrid.appendChild(b));
        }

        // Row events
        function bindRow(row) {
            row.addEventListener('click', () => {
                if (selectedDishRow) selectedDishRow.classList.remove('selected');
                selectedDishRow = row;
                row.classList.add('selected');
                if (btnEditDish) btnEditDish.disabled = false;
                if (btnDelDish) btnDelDish.disabled = false;
                loadDishIntoForm(row);
            });
            row.addEventListener('dblclick', () => {
                loadDishIntoForm(row);
                if (formName) formName.focus();
            });
        }
        document.querySelectorAll('#modal-dishes-tbody .dish-row').forEach(bindRow);

        function loadDishIntoForm(row) {
            formId.value = row.dataset.id;
            formCat.value = row.dataset.catId;
            formSubgroup.value = row.dataset.subgroup || '';
            formCode.value = row.dataset.code;
            formName.value = row.dataset.name;
            formUnit.value = row.dataset.unit || 'Phần';
            formPrice.value = formatVND(row.dataset.p1 || 0);
            formPrice2.value = formatVND(row.dataset.p2 || 0);
            formPrice3.value = formatVND(row.dataset.p3 || 0);
            formType.value = row.dataset.type || 'food';
            if (formReason) formReason.value = '';

            if (formTitle) formTitle.textContent = `Sửa món: ${row.dataset.name}`;
            if (formMode) {
                formMode.textContent = 'Đang sửa';
                formMode.className = 'badge-mode edit-mode';
            }
            if (btnSwitchAdd) btnSwitchAdd.style.display = 'inline-flex';
        }

        function resetDishForm() {
            formId.value = '';
            if (selectedCatId !== 'all') {
                formCat.value = selectedCatId;
            } else {
                formCat.value = formCat.options.length > 1 ? formCat.options[1].value : '';
            }
            formSubgroup.value = '';
            formCode.value = '';
            formName.value = '';
            formUnit.value = 'Phần';
            formPrice.value = '0';
            formPrice2.value = '0';
            formPrice3.value = '0';
            formType.value = 'food';
            if (formReason) formReason.value = '';

            if (formTitle) formTitle.textContent = 'Thêm món mới';
            if (formMode) {
                formMode.textContent = 'Tạo mới';
                formMode.className = 'badge-mode';
            }
            if (btnSwitchAdd) btnSwitchAdd.style.display = 'none';

            if (selectedDishRow) {
                selectedDishRow.classList.remove('selected');
                selectedDishRow = null;
            }
            if (btnEditDish) btnEditDish.disabled = true;
            if (btnDelDish) btnDelDish.disabled = true;
        }

        if (btnAddDish) btnAddDish.addEventListener('click', resetDishForm);
        if (btnCancelDish) btnCancelDish.addEventListener('click', resetDishForm);
        if (btnEditDish) btnEditDish.addEventListener('click', () => {
            if (selectedDishRow) loadDishIntoForm(selectedDishRow);
        });

        // Notice helper
        function showNotice(msg, isError = false) {
            let notice = document.getElementById('modal-menu-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'modal-menu-notice';
                notice.style.position = 'absolute';
                notice.style.top = '14px';
                notice.style.left = '50%';
                notice.style.transform = 'translateX(-50%)';
                notice.style.zIndex = '10005';
                notice.style.padding = '8px 20px';
                notice.style.borderRadius = '30px';
                notice.style.fontSize = '13px';
                notice.style.fontWeight = '700';
                notice.style.fontFamily = 'var(--font-heading)';
                notice.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
                notice.style.transition = 'all 0.25s ease';
                notice.style.pointerEvents = 'none';
                const container = dialog.querySelector('.menu-admin-modal-container') || dialog;
                container.appendChild(notice);
            }
            notice.textContent = msg;
            notice.style.background = isError ? '#ef4444' : '#059669';
            notice.style.color = '#ffffff';
            notice.style.display = 'block';
            notice.style.opacity = '1';
            clearTimeout(notice._timer);
            notice._timer = setTimeout(() => {
                notice.style.opacity = '0';
                setTimeout(() => { notice.style.display = 'none'; }, 250);
            }, 3000);
        }

        // Helper to update or insert dish row in table and POS dish-grid with alphabetical sorting
        function updateOrInsertDish(dish, isEdit = false) {
            let row = tableTbody.querySelector(`.dish-row[data-id="${dish.id}"]`);
            const p1Formatted = formatVND(dish.price);
            const p2Formatted = formatVND(dish.price_2);
            const p3Formatted = formatVND(dish.price_3);

            const rowHtml = `
                <td class="col-cat"><span class="badge-cat">${dish.category_name}</span></td>
                <td class="col-sub">${dish.subgroup || '-'}</td>
                <td class="col-code"><code>${dish.code}</code></td>
                <td class="col-name"><strong>${dish.name}</strong></td>
                <td class="col-unit text-center">${dish.unit}</td>
                <td class="col-price text-right">${p1Formatted} đ</td>
                <td class="col-price-2 text-right">${p2Formatted} đ</td>
                <td class="col-price-3 text-right">${p3Formatted} đ</td>
                <td class="col-type text-center">
                    <span class="badge-type type-${dish.product_type}">${dish.product_type_display}</span>
                </td>
            `;

            if (row) {
                row.dataset.catId = dish.category_id;
                row.dataset.subgroup = dish.subgroup || '';
                row.dataset.code = dish.code;
                row.dataset.name = dish.name;
                row.dataset.unit = dish.unit;
                row.dataset.p1 = dish.price;
                row.dataset.p2 = dish.price_2;
                row.dataset.p3 = dish.price_3;
                row.dataset.type = dish.product_type;
                row.innerHTML = rowHtml;
            } else {
                const emptyRow = tableTbody.querySelector('tr td.text-center');
                if (emptyRow) emptyRow.closest('tr')?.remove();

                row = document.createElement('tr');
                row.className = 'dish-row';
                row.dataset.id = dish.id;
                row.dataset.catId = dish.category_id;
                row.dataset.subgroup = dish.subgroup || '';
                row.dataset.code = dish.code;
                row.dataset.name = dish.name;
                row.dataset.unit = dish.unit;
                row.dataset.p1 = dish.price;
                row.dataset.p2 = dish.price_2;
                row.dataset.p3 = dish.price_3;
                row.dataset.type = dish.product_type;
                row.innerHTML = rowHtml;
                tableTbody.appendChild(row);
                bindRow(row);
            }

            // Sync with POS Column 3 dish grid
            const dishGrid = document.getElementById('dish-grid');
            if (dishGrid) {
                let gridBtn = dishGrid.querySelector(`.dish[data-product-id="${dish.id}"]`);
                if (gridBtn) {
                    gridBtn.dataset.categoryId = dish.category_id;
                    gridBtn.dataset.code = (dish.code || '').toUpperCase();
                    gridBtn.dataset.dish = dish.name;
                    gridBtn.dataset.subgroup = dish.subgroup || '';
                    gridBtn.dataset.unit = dish.unit;
                    gridBtn.dataset.price = dish.price;
                    const nameEl = gridBtn.querySelector('.dish-name');
                    if (nameEl) nameEl.textContent = dish.name;
                    let codeEl = gridBtn.querySelector('.dish-code-tag');
                    if (dish.code) {
                        if (!codeEl) {
                            codeEl = document.createElement('span');
                            codeEl.className = 'dish-code-tag';
                            const titleRow = gridBtn.querySelector('.dish-name-row') || nameEl.parentElement;
                            titleRow.appendChild(codeEl);
                        }
                        codeEl.textContent = dish.code;
                    } else if (codeEl) {
                        codeEl.remove();
                    }
                    const priceEl = gridBtn.querySelector('.dish-price');
                    if (priceEl) priceEl.textContent = `${p1Formatted} đ`;
                    const unitEl = gridBtn.querySelector('.dish-unit');
                    if (unitEl) unitEl.textContent = `/ ${dish.unit}`;
                } else {
                    const newBtn = document.createElement('button');
                    newBtn.className = 'dish';
                    newBtn.dataset.productId = dish.id;
                    newBtn.dataset.categoryId = dish.category_id;
                    newBtn.dataset.code = (dish.code || '').toUpperCase();
                    newBtn.dataset.dish = dish.name;
                    newBtn.dataset.subgroup = dish.subgroup || '';
                    newBtn.dataset.unit = dish.unit;
                    newBtn.dataset.price = dish.price;
                    newBtn.type = 'button';
                    newBtn.innerHTML = `
                        <div class="dish-info">
                            <div class="dish-name-row">
                                <b class="dish-name">${dish.name}</b>
                                ${dish.code ? `<span class="dish-code-tag">${dish.code}</span>` : ''}
                            </div>
                            <div class="dish-meta">
                                <span class="dish-price">${p1Formatted} đ</span>
                                <span class="dish-unit">/ ${dish.unit}</span>
                            </div>
                        </div>
                        <span class="dish-add-pill">+</span>
                    `;
                    dishGrid.appendChild(newBtn);
                }
                sortDishGrid();
                if (typeof window.refreshPosMenuFilter === 'function') {
                    window.refreshPosMenuFilter();
                }
            }

            // NHẢY XẾP HÀNG THEO BẢNG CHỮ CÁI (A-B-C...)
            sortDishRows();
            filterDishes();

            // Cuộn mượt tới món vừa lưu và tạo hiệu ứng nhấp nháy nhận biết
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            row.classList.add('just-updated');
            setTimeout(() => row.classList.remove('just-updated'), 2000);

            if (isEdit) {
                if (selectedDishRow) selectedDishRow.classList.remove('selected');
                selectedDishRow = row;
                row.classList.add('selected');
                loadDishIntoForm(row);
            } else {
                // Thêm món mới xong -> Tự động reset form về Tạo mới để sẵn sàng thêm tiếp món khác, KHÔNG đè lên món vừa tạo
                resetDishForm();
                if (formCode) formCode.focus();
            }
        }

        // Sắp xếp Alphabet ngay khi mở trang
        sortDishRows();
        sortDishGrid();

        // Save dish without full page reload
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = document.getElementById('modal-btn-submit-dish');
                const origHtml = submitBtn ? submitBtn.innerHTML : '';
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span>Đang lưu...</span>';
                }

                const isEdit = Boolean(formId.value);
                const payload = {
                    dish_id: formId.value,
                    category_id: formCat.value,
                    subgroup: formSubgroup.value.trim(),
                    code: formCode.value.trim().toUpperCase(),
                    name: formName.value.trim(),
                    unit: formUnit.value.trim() || 'Phần',
                    price: formPrice.value.replace(/\./g, '').trim(),
                    price_2: formPrice2.value.replace(/\./g, '').trim(),
                    price_3: formPrice3.value.replace(/\./g, '').trim(),
                    product_type: formType.value,
                    reason: formReason ? formReason.value.trim() : '',
                    auto_recipe: formAutoRecipe.checked,
                };
                const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
                try {
                    const resp = await fetch('/catalog/menu/api/save-dish/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                        body: JSON.stringify(payload)
                    });
                    const res = await resp.json();
                    if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi lưu món.');
                    showNotice(res.message);
                    if (res.dish) {
                        updateOrInsertDish(res.dish, isEdit);
                    }
                } catch (err) {
                    showNotice(err.message, true);
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = origHtml;
                    }
                }
            });
        }

        // Delete dish with Reason Submodal
        const delDishModal = document.getElementById('modal-pos-delete-dish');
        const delDishCloseBtn = document.getElementById('modal-pos-delete-dish-close');
        const delDishCancelBtn = document.getElementById('modal-pos-delete-dish-cancel');
        const delDishForm = document.getElementById('form-pos-delete-dish');
        const delDishNameEl = document.getElementById('modal-pos-delete-dish-name');
        const delDishReasonInput = document.getElementById('modal-pos-delete-dish-reason');

        if (delDishCloseBtn) delDishCloseBtn.addEventListener('click', () => { if (delDishModal) delDishModal.hidden = true; });
        if (delDishCancelBtn) delDishCancelBtn.addEventListener('click', () => { if (delDishModal) delDishModal.hidden = true; });

        if (btnDelDish) {
            btnDelDish.addEventListener('click', () => {
                if (!selectedDishRow) return;
                const name = selectedDishRow.dataset.name;
                const code = selectedDishRow.dataset.code;
                if (delDishNameEl) delDishNameEl.textContent = `"${name}" (${code})`;
                if (delDishReasonInput) {
                    delDishReasonInput.value = '';
                    setTimeout(() => delDishReasonInput.focus(), 100);
                }
                if (delDishModal) delDishModal.hidden = false;
            });
        }

        if (delDishForm) {
            delDishForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!selectedDishRow) return;
                const id = selectedDishRow.dataset.id;
                const reason = delDishReasonInput ? delDishReasonInput.value.trim() : '';

                const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
                try {
                    const resp = await fetch(`/catalog/menu/api/delete-dish/${id}/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                        body: JSON.stringify({ reason: reason })
                    });
                    const res = await resp.json();
                    if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi xóa món.');
                    if (delDishModal) delDishModal.hidden = true;
                    showNotice(res.message);

                    selectedDishRow.remove();

                    // Remove from POS dish-grid if exists
                    const gridBtn = document.querySelector(`#dish-grid .dish[data-product-id="${id}"]`);
                    if (gridBtn) gridBtn.remove();

                    resetDishForm();
                    filterDishes();
                } catch (err) {
                    showNotice(err.message, true);
                }
            });
        }

        // Sub-modal Import
        const importModal = document.getElementById('modal-pos-import-excel');
        const openImportBtn = document.getElementById('modal-btn-open-import');
        const closeImportBtn = document.getElementById('modal-pos-import-close');
        const cancelImportBtn = document.getElementById('modal-pos-import-cancel');
        const formImport = document.getElementById('form-pos-import-excel');

        if (openImportBtn) openImportBtn.addEventListener('click', () => { importModal.hidden = false; });
        if (closeImportBtn) closeImportBtn.addEventListener('click', () => { importModal.hidden = true; });
        if (cancelImportBtn) cancelImportBtn.addEventListener('click', () => { importModal.hidden = true; });

        if (formImport) {
            formImport.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(formImport);
                const submitBtn = document.getElementById('btn-pos-submit-import');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Đang nhập...';

                try {
                    const resp = await fetch('/catalog/menu/import/', {
                        method: 'POST',
                        body: formData
                    });
                    const res = await resp.json();
                    if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');
                    showNotice(res.message);
                    importModal.hidden = true;

                    // Reload dishes in-place without page reload
                    const dishesResp = await fetch('/catalog/menu/api/dishes/');
                    if (dishesResp.ok) {
                        const data = await dishesResp.json();
                        if (data.dishes && data.dishes.length) {
                            tableTbody.innerHTML = '';
                            data.dishes.forEach(d => updateOrInsertDish(d));
                            resetDishForm();
                            filterDishes();
                        }
                    }
                } catch (err) {
                    showNotice(err.message, true);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Nhập dữ liệu';
                }
            });
        }

        // Sub-modal Category
        const catModal = document.getElementById('modal-pos-category');
        const catTitle = document.getElementById('modal-pos-cat-title');
        const catIdInput = document.getElementById('modal-pos-cat-id');
        const catNameInput = document.getElementById('modal-pos-cat-name');
        const catColorInput = document.getElementById('modal-pos-cat-color');
        const catOrderInput = document.getElementById('modal-pos-cat-order');
        const formCatSubmit = document.getElementById('form-pos-category');

        if (btnCatAdd) {
            btnCatAdd.addEventListener('click', () => {
                catIdInput.value = '';
                catNameInput.value = '';
                catColorInput.value = '#f59e0b';
                catOrderInput.value = 0;
                catTitle.textContent = 'Thêm danh mục mới';
                catModal.hidden = false;
                catNameInput.focus();
            });
        }
        if (btnCatEdit) {
            btnCatEdit.addEventListener('click', () => {
                if (!selectedCatPill || selectedCatId === 'all') return;
                catIdInput.value = selectedCatId;
                catNameInput.value = selectedCatPill.dataset.catName;
                catColorInput.value = selectedCatPill.dataset.catColor || '#f59e0b';
                catOrderInput.value = selectedCatPill.dataset.catOrder || 0;
                catTitle.textContent = `Sửa danh mục: ${selectedCatPill.dataset.catName}`;
                catModal.hidden = false;
                catNameInput.focus();
            });
        }

        document.getElementById('modal-pos-cat-close')?.addEventListener('click', () => { catModal.hidden = true; });
        document.getElementById('modal-pos-cat-cancel')?.addEventListener('click', () => { catModal.hidden = true; });

        document.querySelectorAll('#modal-pos-category .preset-color').forEach(dot => {
            dot.addEventListener('click', () => {
                catColorInput.value = dot.dataset.color;
            });
        });

        if (formCatSubmit) {
            formCatSubmit.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    category_id: catIdInput.value,
                    name: catNameInput.value,
                    color: catColorInput.value,
                    display_order: catOrderInput.value,
                };
                const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
                try {
                    const resp = await fetch('/catalog/menu/api/save-category/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                        body: JSON.stringify(payload)
                    });
                    const res = await resp.json();
                    if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi lưu danh mục.');
                    showNotice(res.message);
                    catModal.hidden = true;

                    // Update UI in-place
                    const cat = res.category;
                    let pill = document.querySelector(`#modal-categories-pills .cat-pill[data-cat-id="${cat.id}"]`);
                    if (pill) {
                        pill.dataset.catName = cat.name;
                        pill.dataset.catColor = cat.color;
                        pill.dataset.catOrder = cat.display_order;
                        const dot = pill.querySelector('.cat-pill-dot');
                        if (dot) dot.style.backgroundColor = cat.color;
                        const nameEl = pill.querySelector('.cat-pill-name');
                        if (nameEl) nameEl.textContent = cat.name;
                    } else {
                        pill = document.createElement('button');
                        pill.type = 'button';
                        pill.className = 'cat-pill';
                        pill.dataset.catId = cat.id;
                        pill.dataset.catName = cat.name;
                        pill.dataset.catColor = cat.color;
                        pill.dataset.catOrder = cat.display_order;
                        pill.innerHTML = `
                            <span class="cat-pill-dot" style="background-color: ${cat.color};"></span>
                            <span class="cat-pill-name">${cat.name}</span>
                        `;
                        pill.addEventListener('click', () => {
                            document.querySelectorAll('#modal-categories-pills .cat-pill').forEach(p => p.classList.remove('active'));
                            pill.classList.add('active');
                            selectedCatId = String(cat.id);
                            selectedCatPill = pill;
                            if (catLabel) catLabel.textContent = `[${cat.name}]`;
                            if (btnCatEdit) btnCatEdit.disabled = false;
                            if (btnCatDel) btnCatDel.disabled = false;
                            if (formCat) formCat.value = selectedCatId;
                            filterDishes();
                        });
                        document.getElementById('modal-categories-pills').appendChild(pill);
                    }

                    // Update option in formCat select
                    let opt = formCat.querySelector(`option[value="${cat.id}"]`);
                    if (opt) {
                        opt.textContent = cat.name;
                    } else {
                        opt = document.createElement('option');
                        opt.value = cat.id;
                        opt.textContent = cat.name;
                        formCat.appendChild(opt);
                    }
                } catch (err) {
                    showNotice(err.message, true);
                }
            });
        }

        if (btnCatDel) {
            btnCatDel.addEventListener('click', async () => {
                if (!selectedCatPill || selectedCatId === 'all') return;
                const name = selectedCatPill.dataset.catName;
                if (!confirm(`Bạn có chắc chắn muốn xóa danh mục "${name}"?`)) return;

                const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
                try {
                    const resp = await fetch(`/catalog/menu/api/delete-category/${selectedCatId}/`, {
                        method: 'POST',
                        headers: { 'X-CSRFToken': csrfToken }
                    });
                    const res = await resp.json();
                    if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi xóa danh mục.');
                    showNotice(res.message);

                    const catIdToRemove = selectedCatId;
                    selectedCatPill.remove();
                    const opt = formCat.querySelector(`option[value="${catIdToRemove}"]`);
                    if (opt) opt.remove();

                    // Switch back to "all"
                    const allPill = document.querySelector('#modal-categories-pills .cat-pill[data-cat-id="all"]');
                    if (allPill) allPill.click();
                } catch (err) {
                    showNotice(err.message, true);
                }
            });
        }
    })();
