// # File này chịu trách nhiệm xử lý hộp thoại Báo cáo cuối ngày (End of Day Report): nạp dữ liệu tổng kết doanh thu, phương thức thanh toán, món bán và mở trang in.
(function initEndOfDayReportModal() {
    const modal = document.getElementById('modal-end-of-day-report');
    if (!modal) return;

    const closeBtn = document.getElementById('eod-report-modal-close');
    const okBtn = document.getElementById('eod-report-modal-ok');
    const cancelBtn = document.getElementById('eod-report-modal-cancel');

    const asOfTimeEl = document.getElementById('eod-as-of-time');
    const totalInvoicesEl = document.getElementById('eod-total-invoices');
    const totalRevenueEl = document.getElementById('eod-total-revenue');

    const payRefs = {
        cash: {
            count: document.getElementById('eod-pay-cash-count'),
            amount: document.getElementById('eod-pay-cash-amount'),
        },
        card: {
            count: document.getElementById('eod-pay-card-count'),
            amount: document.getElementById('eod-pay-card-amount'),
        },
        e_wallet: {
            count: document.getElementById('eod-pay-ewallet-count'),
            amount: document.getElementById('eod-pay-ewallet-amount'),
        },
        prepaid: {
            count: document.getElementById('eod-pay-prepaid-count'),
            amount: document.getElementById('eod-pay-prepaid-amount'),
        },
        points: {
            count: document.getElementById('eod-pay-points-count'),
            amount: document.getElementById('eod-pay-points-amount'),
        },
        other: {
            count: document.getElementById('eod-pay-other-count'),
            amount: document.getElementById('eod-pay-other-amount'),
        },
        guest: {
            count: document.getElementById('eod-pay-guest-count'),
            amount: document.getElementById('eod-pay-guest-amount'),
        },
        debt: {
            count: document.getElementById('eod-pay-debt-count'),
            amount: document.getElementById('eod-pay-debt-amount'),
        },
        topup: {
            count: document.getElementById('eod-pay-topup-count'),
            amount: document.getElementById('eod-pay-topup-amount'),
        },
    };

    const discountSummaryEl = document.getElementById('eod-discount-summary');
    const editPriceSummaryEl = document.getElementById('eod-edit-price-summary');
    const cancelEditSummaryEl = document.getElementById('eod-cancel-edit-summary');
    const unpaidCountEl = document.getElementById('eod-unpaid-count');
    const unpaidAmountEl = document.getElementById('eod-unpaid-amount');

    const POS_STORAGE_KEY = 'mixfood_pos_table_orders_v1';
    let latestUnpaidStats = { count: 0, amount: 0 };

    function formatDot(val) {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function computeLiveUnpaidOrders() {
        let count = 0;
        let totalAmount = 0;

        try {
            const raw = sessionStorage.getItem(POS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                Object.values(parsed).forEach((tData) => {
                    const entries = Array.isArray(tData?.items) ? tData.items : [];
                    if (!entries.length) return;

                    let tableSubtotal = 0;
                    let tableItemDiscount = 0;
                    entries.forEach((entry) => {
                        const item = Array.isArray(entry) ? entry[1] : entry;
                        const qty = Number(item?.quantity) || 0;
                        const price = Number(item?.price) || 0;
                        if (qty <= 0) return;
                        const gross = qty * price;
                        const discPct = Math.min(100, Math.max(0, Number(item?.discount_percent) || 0));
                        const discAmt = item?.discount_amount !== undefined
                            ? Number(item.discount_amount) || 0
                            : Math.round((gross * discPct) / 100);
                        tableSubtotal += gross;
                        tableItemDiscount += Math.min(gross, Math.max(0, discAmt));
                    });

                    const surcharge = Math.max(0, Number(tData?.surchargeAmount) || 0);
                    const orderDiscount = Math.max(0, Number(tData?.orderDiscountAmount) || 0);
                    const netTableTotal = Math.max(0, tableSubtotal - tableItemDiscount - orderDiscount + surcharge);

                    count += 1;
                    totalAmount += netTableTotal;
                });
            }
        } catch (err) {
            // Ignore sessionStorage errors
        }

        return { count, amount: totalAmount };
    }

    async function fetchAndRenderEndOfDay() {
        const apiUrl = modal.dataset.apiUrl;
        if (!apiUrl) return;

        const hideNumbers =
            typeof window.posGetExtraOption === 'function' &&
            Boolean(window.posGetExtraOption('hide_shift_close_numbers'));

        latestUnpaidStats = computeLiveUnpaidOrders();
        if (unpaidCountEl) unpaidCountEl.textContent = hideNumbers ? '***' : String(latestUnpaidStats.count);
        if (unpaidAmountEl) unpaidAmountEl.textContent = hideNumbers ? '***' : formatDot(latestUnpaidStats.amount);

        try {
            const response = await fetch(apiUrl, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Không thể tải dữ liệu báo cáo cuối ngày.');
            }

            if (asOfTimeEl) asOfTimeEl.textContent = data.as_of_display || '';
            if (totalInvoicesEl) totalInvoicesEl.textContent = hideNumbers ? '***' : String(data.total_invoices ?? 0);
            if (totalRevenueEl) totalRevenueEl.textContent = hideNumbers ? '*** đ' : `${data.total_revenue_formatted || '0'} đ`;

            const pmap = data.payments_by_key || {};
            Object.entries(payRefs).forEach(([key, refs]) => {
                const row = pmap[key];
                const defaultParen = ['prepaid', 'points', 'guest'].includes(key);
                if (refs.count) {
                    refs.count.textContent = hideNumbers ? '*' : String(row ? row.count : 0);
                }
                if (refs.amount) {
                    if (hideNumbers) {
                        refs.amount.textContent = defaultParen ? '(***)' : '***';
                    } else {
                        refs.amount.textContent = row ? row.amount_formatted : (defaultParen ? '(0)' : '0');
                    }
                }
            });

            if (discountSummaryEl) {
                const dCount = hideNumbers ? '*' : (data.discount_invoice_count ?? 0);
                const dAmt = hideNumbers ? '***' : (data.discount_total_formatted || '0');
                discountSummaryEl.innerHTML =
                    `Có ${dCount} hóa đơn giảm giá (${data.coupon_count ?? 0} mã giảm, ${data.vip_count ?? 0} thẻ vip, ${data.gift_count ?? 0} tặng món) -<br>` +
                    `Giảm ${dAmt} đ`;
            }

            if (editPriceSummaryEl) {
                editPriceSummaryEl.textContent = `Có ${data.edit_price_discount_count ?? 0} lần sửa đơn giá/giảm giá món`;
            }
            if (cancelEditSummaryEl) {
                cancelEditSummaryEl.textContent =
                    `Có ${data.cancel_return_item_count ?? 0} lần trả/hủy món, ${data.edit_delete_invoice_count ?? 0} lần sửa/xóa hóa đơn`;
            }
        } catch (err) {
            if (asOfTimeEl) asOfTimeEl.textContent = 'Lỗi tải dữ liệu';
        }
    }

    function triggerPrintReport(event) {
        const printUrl = modal.dataset.printUrl;
        if (!printUrl) {
            closeModal();
            return;
        }
        let mode = 'summary';
        if (event && (event.ctrlKey || event.metaKey)) {
            mode = 'detail_today';
        } else if (event && event.shiftKey) {
            mode = 'detail_yesterday';
        }

        const params = new URLSearchParams({
            mode,
            unpaid_count: String(latestUnpaidStats.count || 0),
            unpaid_amount: String(latestUnpaidStats.amount || 0),
        });
        window.open(`${printUrl}?${params.toString()}`, '_blank', 'noopener');
        closeModal();
    }

    function openModal() {
        document.querySelectorAll('.pos-menu-item.open').forEach((item) => {
            item.classList.remove('open');
            const btn = item.querySelector('.nav-menu-btn') || item.querySelector(':scope > button');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        modal.hidden = false;
        fetchAndRenderEndOfDay();
        window.setTimeout(() => okBtn?.focus(), 40);
    }

    function closeModal() {
        modal.hidden = true;
    }

    window.openEndOfDayReportModal = openModal;
    window.closeEndOfDayReportModal = closeModal;

    document.querySelectorAll('#open-end-of-day-report-menu, [data-open-eod-report]').forEach((trigger) => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (okBtn) {
        okBtn.addEventListener('click', (e) => {
            triggerPrintReport(e);
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (modal.hidden) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeModal();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            triggerPrintReport(e);
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open_eod_report') === '1') {
        window.setTimeout(() => openModal(), 150);
    }
})();
