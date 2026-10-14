/**
 * Invoice Editor Controller (Chức năng Sửa hóa đơn)
 * Tương thích chuẩn F&B SaaS 2026 và giao diện hệ thống MixFood
 */
(() => {
    let currentInvoiceCode = null;
    let currentItems = [];
    let selectedItemIndex = -1;
    let allProducts = [];
    let allCashiers = [];
    let allPaymentMethods = [];

    const formatVND = (num) => {
        const val = Math.round(Number(num) || 0);
        return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' đ';
    };

    const getCsrfToken = () => {
        return document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';
    };

    const getElements = () => ({
        modal: document.getElementById('modal-invoice-editor'),
        closeBtn: document.getElementById('modal-inv-edit-close'),
        cancelBtn: document.getElementById('btn-inv-edit-cancel'),
        confirmBtn: document.getElementById('btn-inv-edit-confirm'),
        modalTitle: document.getElementById('inv-edit-modal-title'),
        tableName: document.getElementById('inv-edit-table-name'),
        cashierSelect: document.getElementById('inv-edit-cashier-select'),
        paymentSelect: document.getElementById('inv-edit-payment-select'),
        itemsTbody: document.getElementById('inv-edit-items-tbody'),
        btnPlus: document.getElementById('inv-edit-btn-plus'),
        btnMinus: document.getElementById('inv-edit-btn-minus'),
        productSelect: document.getElementById('inv-edit-product-select'),
        customNameInput: document.getElementById('inv-edit-custom-name'),
        customPriceInput: document.getElementById('inv-edit-custom-price'),
        btnAddCustom: document.getElementById('inv-edit-btn-add-custom'),
        subtotalDisplay: document.getElementById('inv-edit-subtotal-display'),
        surchargeInput: document.getElementById('inv-edit-surcharge-input'),
        discountInput: document.getElementById('inv-edit-discount-input'),
        taxInput: document.getElementById('inv-edit-tax-input'),
        totalDisplay: document.getElementById('inv-edit-total-display'),
        reasonInput: document.getElementById('inv-edit-reason-input'),
    });

    const recalculateTotals = () => {
        const els = getElements();
        let subtotal = 0;
        currentItems.forEach(item => {
            const raw = (Number(item.unit_price) || 0) * (Number(item.quantity) || 1);
            const disc = raw * ((Number(item.discount_percent) || 0) / 100);
            subtotal += Math.max(0, raw - disc);
        });

        const surcharge = Math.max(0, Number(els.surchargeInput?.value) || 0);
        const discount = Math.max(0, Number(els.discountInput?.value) || 0);
        const taxVal = Math.max(0, Number(els.taxInput?.value) || 0);

        let taxAmount = 0;
        if (taxVal > 0 && taxVal <= 100) {
            taxAmount = Math.round((subtotal + surcharge - discount) * (taxVal / 100));
        } else {
            taxAmount = taxVal;
        }

        const total = Math.max(0, subtotal + surcharge - discount + taxAmount);

        if (els.subtotalDisplay) els.subtotalDisplay.textContent = formatVND(subtotal);
        if (els.totalDisplay) els.totalDisplay.textContent = formatVND(total);

        return { subtotal, surcharge, discount, tax: taxAmount, total };
    };

    const renderItemsTable = () => {
        const els = getElements();
        if (!els.itemsTbody) return;

        if (!currentItems || currentItems.length === 0) {
            els.itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #94a3b8; padding: 24px;">Hóa đơn chưa có món nào.</td></tr>';
            selectedItemIndex = -1;
            recalculateTotals();
            return;
        }

        els.itemsTbody.innerHTML = currentItems.map((item, idx) => {
            const isSelected = (idx === selectedItemIndex);
            const formattedPrice = (Number(item.unit_price) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            return `
                <tr class="inv-edit-row ${isSelected ? 'selected' : ''}" data-index="${idx}">
                    <td class="col-name" style="font-weight: 500;">${item.product_name}</td>
                    <td class="col-price" style="text-align: right;">${formattedPrice}</td>
                    <td class="col-disc" style="text-align: center;">${item.discount_percent || 0}</td>
                    <td class="col-qty" style="text-align: center; font-weight: 700;">${item.quantity}</td>
                </tr>
            `;
        }).join('');

        els.itemsTbody.querySelectorAll('.inv-edit-row').forEach(row => {
            row.addEventListener('click', () => {
                const idx = Number(row.dataset.index);
                selectedItemIndex = idx;
                renderItemsTable();
            });
        });

        recalculateTotals();
    };

    window.openInvoiceEditor = async (invoiceCode) => {
        if (!invoiceCode) return;
        currentInvoiceCode = invoiceCode;
        const els = getElements();
        if (!els.modal) return;

        els.modal.hidden = false;
        if (els.modalTitle) els.modalTitle.textContent = `Sửa hóa đơn (Số ${invoiceCode}) - Đang tải...`;
        if (els.itemsTbody) els.itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 24px;">Đang tải dữ liệu hóa đơn...</td></tr>';

        try {
            const resp = await fetch(`/sales/invoices/detail/${invoiceCode}/`);
            if (!resp.ok) throw new Error('Không thể tải chi tiết hóa đơn.');
            const data = await resp.json();

            const inv = data.invoice;
            allProducts = data.products || [];
            allCashiers = data.cashiers || [];
            allPaymentMethods = data.payment_methods || [];

            // Update title & metadata
            if (els.modalTitle) els.modalTitle.textContent = `Sửa hóa đơn (Số ${inv.invoice_code}) - ${inv.cashier_name}`;
            if (els.tableName) els.tableName.textContent = inv.table_name || 'Mang về';

            // Populate cashiers
            if (els.cashierSelect) {
                els.cashierSelect.innerHTML = allCashiers.map(c => `
                    <option value="${c.id}" ${c.id === inv.cashier_id ? 'selected' : ''}>${c.name}</option>
                `).join('');
            }

            // Populate payment methods
            if (els.paymentSelect) {
                els.paymentSelect.innerHTML = allPaymentMethods.map(p => `
                    <option value="${p.code}" ${p.code === inv.payment_method ? 'selected' : ''}>${p.name}</option>
                `).join('');
            }

            // Populate products dropdown
            if (els.productSelect) {
                els.productSelect.innerHTML = '<option value="">&lt;Thêm món mới&gt;</option>' +
                    allProducts.map(p => `<option value="${p.id}">${p.name} - ${formatVND(p.price)}</option>`).join('');
            }

            // Populate items and calculations
            currentItems = (inv.items || []).map(i => ({
                id: i.id,
                product_id: i.product_id,
                product_name: i.product_name,
                unit: i.unit || 'Phần',
                unit_price: Number(i.unit_price) || 0,
                quantity: Number(i.quantity) || 1,
                discount_percent: Number(i.discount_percent) || 0,
            }));
            selectedItemIndex = currentItems.length > 0 ? 0 : -1;

            if (els.surchargeInput) els.surchargeInput.value = inv.surcharge_amount || 0;
            if (els.discountInput) els.discountInput.value = inv.discount_amount || 0;
            if (els.taxInput) els.taxInput.value = inv.tax_amount || 0;
            if (els.reasonInput) els.reasonInput.value = '';

            renderItemsTable();
        } catch (err) {
            alert('Lỗi: ' + (err.message || 'Không thể mở sửa hóa đơn.'));
            els.modal.hidden = true;
        }
    };

    const initEventListeners = () => {
        const els = getElements();
        if (!els.modal) return;

        // Close & Cancel
        const closeModal = () => { els.modal.hidden = true; };
        if (els.closeBtn) els.closeBtn.addEventListener('click', closeModal);
        if (els.cancelBtn) els.cancelBtn.addEventListener('click', closeModal);

        // Increase quantity (+)
        if (els.btnPlus) {
            els.btnPlus.addEventListener('click', () => {
                if (selectedItemIndex >= 0 && selectedItemIndex < currentItems.length) {
                    currentItems[selectedItemIndex].quantity += 1;
                    renderItemsTable();
                } else if (currentItems.length > 0) {
                    selectedItemIndex = 0;
                    currentItems[0].quantity += 1;
                    renderItemsTable();
                }
            });
        }

        // Decrease quantity (-)
        if (els.btnMinus) {
            els.btnMinus.addEventListener('click', () => {
                if (selectedItemIndex >= 0 && selectedItemIndex < currentItems.length) {
                    if (currentItems[selectedItemIndex].quantity > 1) {
                        currentItems[selectedItemIndex].quantity -= 1;
                    } else {
                        // Confirm removal if quantity is 1
                        const name = currentItems[selectedItemIndex].product_name;
                        if (confirm(`Bỏ món "${name}" khỏi hóa đơn?`)) {
                            currentItems.splice(selectedItemIndex, 1);
                            selectedItemIndex = Math.min(selectedItemIndex, currentItems.length - 1);
                        }
                    }
                    renderItemsTable();
                }
            });
        }

        // Add dish from select dropdown
        if (els.productSelect) {
            els.productSelect.addEventListener('change', () => {
                const prodId = Number(els.productSelect.value);
                if (!prodId) return;
                const prod = allProducts.find(p => p.id === prodId);
                if (prod) {
                    const existing = currentItems.find(it => it.product_id === prod.id);
                    if (existing) {
                        existing.quantity += 1;
                        selectedItemIndex = currentItems.indexOf(existing);
                    } else {
                        currentItems.push({
                            product_id: prod.id,
                            product_name: prod.name,
                            unit: prod.unit || 'Phần',
                            unit_price: Number(prod.price) || 0,
                            quantity: 1,
                            discount_percent: 0,
                        });
                        selectedItemIndex = currentItems.length - 1;
                    }
                    els.productSelect.value = '';
                    renderItemsTable();
                }
            });
        }

        // Add custom dish / change price
        if (els.btnAddCustom) {
            els.btnAddCustom.addEventListener('click', () => {
                const name = (els.customNameInput?.value || '').trim();
                const price = Math.max(0, Number(els.customPriceInput?.value) || 0);
                if (!name) {
                    alert('Vui lòng nhập tên món.');
                    els.customNameInput?.focus();
                    return;
                }
                currentItems.push({
                    product_id: null,
                    product_name: name,
                    unit: 'Phần',
                    unit_price: price,
                    quantity: 1,
                    discount_percent: 0,
                });
                if (els.customNameInput) els.customNameInput.value = '';
                if (els.customPriceInput) els.customPriceInput.value = '';
                selectedItemIndex = currentItems.length - 1;
                renderItemsTable();
            });
        }

        // Live input calculations
        [els.surchargeInput, els.discountInput, els.taxInput].forEach(inp => {
            if (inp) {
                inp.addEventListener('input', recalculateTotals);
                inp.addEventListener('change', recalculateTotals);
            }
        });

        // Confirm submit
        if (els.confirmBtn) {
            els.confirmBtn.addEventListener('click', async () => {
                if (!currentItems || currentItems.length === 0) {
                    alert('Hóa đơn phải có ít nhất một món ăn.');
                    return;
                }

                const reason = (els.reasonInput?.value || '').trim();
                if (!reason) {
                    alert('Vui lòng nhập lý do sửa hóa đơn để lưu vào nhật ký kiểm toán.');
                    els.reasonInput?.focus();
                    return;
                }

                const payload = {
                    invoice_code: currentInvoiceCode,
                    cashier_id: Number(els.cashierSelect?.value) || null,
                    payment_method: els.paymentSelect?.value || 'cash',
                    items: currentItems,
                    surcharge_amount: Number(els.surchargeInput?.value) || 0,
                    discount_amount: Number(els.discountInput?.value) || 0,
                    tax_amount: Number(els.taxInput?.value) || 0,
                    reason: reason,
                };

                const origText = els.confirmBtn.textContent;
                els.confirmBtn.disabled = true;
                els.confirmBtn.textContent = 'Đang lưu...';

                try {
                    const resp = await fetch('/sales/invoices/edit/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCsrfToken(),
                        },
                        body: JSON.stringify(payload),
                    });
                    const res = await resp.json();
                    if (!resp.ok || !res.ok) throw new Error(res.error || 'Lỗi khi lưu sửa hóa đơn.');

                    alert(res.message || 'Đã sửa hóa đơn thành công!');
                    els.modal.hidden = true;

                    // Trigger table refresh on page if function exists
                    if (typeof window.refreshInvoiceReportTable === 'function') {
                        window.refreshInvoiceReportTable();
                    } else if (typeof window.fetchReport === 'function') {
                        window.fetchReport(1);
                    } else {
                        // Reload page or reload invoice data
                        setTimeout(() => { window.location.reload(); }, 300);
                    }
                } catch (err) {
                    alert('Lỗi: ' + (err.message || 'Không thể lưu hóa đơn.'));
                } finally {
                    els.confirmBtn.disabled = false;
                    els.confirmBtn.textContent = origText;
                }
            });
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEventListeners);
    } else {
        initEventListeners();
    }
})();

