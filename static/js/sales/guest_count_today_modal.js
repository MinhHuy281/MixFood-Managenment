// # File này chịu trách nhiệm xử lý hộp thoại Thống kê Lượng khách hôm nay / cuối ngày theo khu vực và khung giờ phục vụ.
(function initGuestCountTodayModal() {
    const modal = document.getElementById('modal-guest-count-today');
    if (!modal) return;

    const closeBtn = document.getElementById('guest-count-modal-close');
    const okBtn = document.getElementById('guest-count-modal-ok');

    const tablesRatioEl = document.getElementById('gc-tables-ratio');
    const guestsRatioEl = document.getElementById('gc-guests-ratio');
    const itemsTotalRatioEl = document.getElementById('gc-items-total-ratio');
    const itemsFoodRatioEl = document.getElementById('gc-items-food-ratio');
    const itemsDrinkRatioEl = document.getElementById('gc-items-drink-ratio');
    const itemsOtherRatioEl = document.getElementById('gc-items-other-ratio');
    const kitchenCountEl = document.getElementById('gc-kitchen-count');

    const POS_STORAGE_KEY = 'mixfood_pos_table_orders_v1';

    function getLocalTodayISO() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function getKitchenStorageKey(dateStr) {
        return `mixfood_pos_kitchen_receptions_${dateStr || getLocalTodayISO()}`;
    }

    window.recordPosKitchenReception = function() {
        try {
            const key = getKitchenStorageKey();
            const current = Number(localStorage.getItem(key)) || 0;
            localStorage.setItem(key, String(current + 1));
        } catch (err) {
            // Ignore storage errors
        }
    };

    function classifyItemType(item, productTypeMap) {
        const pid = String(item?.product_id || '');
        if (pid && productTypeMap && productTypeMap[pid]) {
            return productTypeMap[pid];
        }
        if (pid) {
            const dishBtn = document.querySelector(`.dish[data-product-id="${pid}"]`);
            if (dishBtn && dishBtn.dataset.productType) {
                const dt = dishBtn.dataset.productType.toLowerCase();
                if (dt === 'drink') return 'drink';
                if (dt === 'other' || dt === 'topping') return 'other';
            }
        }
        const nameUpper = String(item?.name || '').toUpperCase();
        const drinkWords = ['TRÀ ', 'NƯỚC ', 'CAFE', 'CÀ PHÊ', 'PEPSI', '7UP', 'COCA', 'BIA ', 'SODA', 'SINH TỐ', 'SỮA '];
        if (drinkWords.some((w) => nameUpper.includes(w))) {
            return 'drink';
        }
        return 'food';
    }

    function collectLivePosTableStats(productTypeMap, dbOccupiedIds) {
        const occupiedSet = new Set();
        if (Array.isArray(dbOccupiedIds)) {
            dbOccupiedIds.forEach((id) => occupiedSet.add(String(id)));
        }

        const domTables = Array.from(document.querySelectorAll('.table'));
        domTables.forEach((btn) => {
            const tid = String(btn.dataset.tableId || '');
            if (!tid) return;
            const isOcc =
                btn.classList.contains('occupied') ||
                btn.classList.contains('table-green') ||
                btn.classList.contains('table-red') ||
                btn.classList.contains('table-opening') ||
                btn.classList.contains('kitchen-sent');
            if (isOcc) {
                occupiedSet.add(tid);
            } else {
                // Nếu trên giao diện POS bàn đang trống hoàn toàn thì loại khỏi tập đang có khách
                occupiedSet.delete(tid);
            }
        });

        let activeFood = 0;
        let activeDrink = 0;
        let activeOther = 0;
        let activeKitchenSentTables = 0;

        try {
            const raw = sessionStorage.getItem(POS_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                Object.entries(parsed).forEach(([tId, tData]) => {
                    const entries = Array.isArray(tData?.items) ? tData.items : [];
                    if (entries.length > 0 || tData?.itemsSentToKitchen) {
                        occupiedSet.add(String(tId));
                    }
                    if (tData?.itemsSentToKitchen) {
                        activeKitchenSentTables += 1;
                    }
                    entries.forEach((entry) => {
                        const item = Array.isArray(entry) ? entry[1] : entry;
                        const qty = Number(item?.quantity) || 0;
                        if (qty <= 0) return;
                        const ptype = classifyItemType(item, productTypeMap);
                        if (ptype === 'drink') {
                            activeDrink += qty;
                        } else if (ptype === 'other') {
                            activeOther += qty;
                        } else {
                            activeFood += qty;
                        }
                    });
                });
            }
        } catch (err) {
            // Ignore session parse errors
        }

        return {
            occupiedCount: occupiedSet.size,
            domTableCount: domTables.length,
            activeFood,
            activeDrink,
            activeOther,
            activeTotal: activeFood + activeDrink + activeOther,
            activeKitchenSentTables,
        };
    }

    async function fetchAndRenderGuestCount() {
        const apiUrl = modal.dataset.apiUrl;
        if (!apiUrl) return;

        try {
            const response = await fetch(apiUrl, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Không thể tải dữ liệu lượng khách hôm nay.');
            }

            const live = collectLivePosTableStats(data.product_type_map || {}, data.db_occupied_table_ids || []);
            const totalTables = Number(data.total_tables) || live.domTableCount || 0;
            const occupiedTables = Math.min(live.occupiedCount, totalTables || live.occupiedCount);

            const paidFood = Number(data.paid_food_qty) || 0;
            const paidDrink = Number(data.paid_drink_qty) || 0;
            const paidOther = Number(data.paid_other_qty) || 0;

            const totalFoodToday = live.activeFood + paidFood;
            const totalDrinkToday = live.activeDrink + paidDrink;
            const totalOtherToday = live.activeOther + paidOther;
            const totalItemsToday = totalFoodToday + totalDrinkToday + totalOtherToday;

            const paidInvoicesCount = Number(data.paid_invoices_count) || 0;
            const baseKitchenCount = paidInvoicesCount + live.activeKitchenSentTables;
            let savedKitchenCount = 0;
            try {
                savedKitchenCount = Number(localStorage.getItem(getKitchenStorageKey(data.date))) || 0;
                if (baseKitchenCount > savedKitchenCount) {
                    localStorage.setItem(getKitchenStorageKey(data.date), String(baseKitchenCount));
                    savedKitchenCount = baseKitchenCount;
                }
            } catch (err) {
                savedKitchenCount = baseKitchenCount;
            }
            const kitchenCount = Math.max(baseKitchenCount, savedKitchenCount);

            if (tablesRatioEl) tablesRatioEl.textContent = `${occupiedTables}/${totalTables}`;
            if (guestsRatioEl) guestsRatioEl.textContent = '?/?';
            if (itemsTotalRatioEl) itemsTotalRatioEl.textContent = `${live.activeTotal}/${totalItemsToday}`;
            if (itemsFoodRatioEl) itemsFoodRatioEl.textContent = `${live.activeFood}/${totalFoodToday}`;
            if (itemsDrinkRatioEl) itemsDrinkRatioEl.textContent = `${live.activeDrink}/${totalDrinkToday}`;
            if (itemsOtherRatioEl) itemsOtherRatioEl.textContent = `${live.activeOther}/${totalOtherToday}`;
            if (kitchenCountEl) kitchenCountEl.textContent = `${kitchenCount}`;
        } catch (err) {
            const live = collectLivePosTableStats({}, []);
            if (tablesRatioEl) tablesRatioEl.textContent = `${live.occupiedCount}/${live.domTableCount}`;
            if (guestsRatioEl) guestsRatioEl.textContent = '?/?';
            if (itemsTotalRatioEl) itemsTotalRatioEl.textContent = `${live.activeTotal}/${live.activeTotal}`;
            if (itemsFoodRatioEl) itemsFoodRatioEl.textContent = `${live.activeFood}/${live.activeFood}`;
            if (itemsDrinkRatioEl) itemsDrinkRatioEl.textContent = `${live.activeDrink}/${live.activeDrink}`;
            if (itemsOtherRatioEl) itemsOtherRatioEl.textContent = `${live.activeOther}/${live.activeOther}`;
            if (kitchenCountEl) kitchenCountEl.textContent = `${live.activeKitchenSentTables}`;
        }
    }

    function openModal() {
        // Đóng các menu dropdown trên thanh điều hướng POS
        document.querySelectorAll('.pos-menu-item.open').forEach((item) => {
            item.classList.remove('open');
            const btn = item.querySelector('.nav-menu-btn') || item.querySelector(':scope > button');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        });

        modal.hidden = false;
        fetchAndRenderGuestCount();
        window.setTimeout(() => okBtn?.focus(), 40);
    }

    function closeModal() {
        modal.hidden = true;
    }

    window.openGuestCountTodayModal = openModal;
    window.closeGuestCountTodayModal = closeModal;

    document.querySelectorAll('#open-guest-count-menu, .report-action[data-report="guest-count"], [data-open-guest-count]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (okBtn) okBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (!modal.hidden && (e.key === 'Escape' || e.key === 'Enter')) {
            e.preventDefault();
            closeModal();
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open_guest_count') === '1') {
        window.setTimeout(() => openModal(), 150);
    }
})();
