document.addEventListener('DOMContentLoaded', () => {
    const selectedTable = document.querySelector('#selected-table');
    const orderItems = document.querySelector('#order-items');
    const menuTitle = document.querySelector('#menu-title');
    const subtotalElement = document.querySelector('#order-subtotal');
    const surchargeElement = document.querySelector('#order-surcharge');
    const discountElement = document.querySelector('#order-discount');
    const totalElement = document.querySelector('#order-total');
    const orderTitle = document.querySelector('#order-title');
    const orderMode = document.querySelector('#order-mode');
    const orderTime = document.querySelector('#order-time');
    const orderStatus = document.querySelector('#order-status');
    const orderCustomer = document.querySelector('#order-customer');
    const orderRequestedBy = document.querySelector('#order-requested-by');
    const orderColumn = document.querySelector('#order-column');
    const selectionActions = document.querySelector('#table-selection-actions');
    const orderOpenActions = document.querySelector('#order-open-actions');
    const orderPrimaryAction = document.querySelector('#order-primary-action');
    const selectionPrimaryAction = document.querySelector('#cancel-selected-table');
    const tableReserveActions = document.querySelector('#table-reserve-actions');
    const btnTableReserve = document.querySelector('#btn-table-reserve');
    const btnTableReserveLabel = document.querySelector('#btn-table-reserve-label');
    const tableOpenTools = document.querySelector('#table-open-tools');
    const tableToolButtons = Array.from(document.querySelectorAll('#table-open-tools button[data-table-tool]'));
    const tableToolHint = document.querySelector('#table-tool-hint');
    const tableToolHintText = document.querySelector('#table-tool-hint-text');
    const tableToolHintCancel = document.querySelector('#table-tool-hint-cancel');

    const tableOrders = new Map();
    const tableLastPaidMap = new Map();
    try {
        const rawLastPaid = JSON.parse(document.querySelector('#pos-table-last-paid-data')?.textContent || '{}');
        Object.entries(rawLastPaid).forEach(([k, v]) => {
            if (v && v.invoice_code) {
                tableLastPaidMap.set(String(k), v);
            }
        });
    } catch (e) {
        console.warn('Could not parse pos-table-last-paid-data', e);
    }

    let cart = new Map();
    let selectedTableId = null;
    let dialogProduct = null;
    let editingCartItemId = null;
    let menuUnlocked = false;
    let itemsSentToKitchen = false;
    let previewedTable = null;
    let tablePreviewArmed = false;
    let activeTableTool = null;
    let pendingTargetTable = null;
    let pendingUndoTarget = null;

    const dialog = document.querySelector('#order-dialog');
    const menuColumn = document.querySelector('.menu-column');
    const posLayout = document.querySelector('.pos-layout');
    const dialogQuantity = document.querySelector('#dialog-quantity');
    const dialogPrice = document.querySelector('#dialog-price');
    const dialogDiscount = document.querySelector('#dialog-discount');
    const paymentDialog = document.querySelector('#payment-dialog');
    const paymentTotal = document.querySelector('#payment-total');
    const paymentMethodDialog = document.querySelector('#payment-method-dialog');
    const customerPaid = document.querySelector('#customer-paid');
    const changeAmount = document.querySelector('#change-amount');
    const paymentConfirm = document.querySelector('#payment-confirm');

    const POS_STORAGE_KEY = 'mixfood_pos_table_orders_v1';

    const saveTableOrdersToSession = () => {
        try {
            const serialized = {};
            tableOrders.forEach((tData, tId) => {
                serialized[String(tId)] = {
                    items: Array.from(tData.cart.entries()),
                    itemsSentToKitchen: Boolean(tData.itemsSentToKitchen),
                    tableName: tData.tableName || '',
                    area: tData.area || '',
                    arrivalTime: tData.arrivalTime || '',
                    combinedWith: tData.combinedWith || null,
                    surchargeAmount: Number(tData.surchargeAmount) || 0,
                    orderDiscountAmount: Number(tData.orderDiscountAmount) || 0,
                };
            });
            sessionStorage.setItem(POS_STORAGE_KEY, JSON.stringify(serialized));
        } catch (err) {
            // Ignore storage errors
        }
    };

    const loadTableOrdersFromSession = () => {
        try {
            const raw = sessionStorage.getItem(POS_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            Object.entries(parsed).forEach(([tId, data]) => {
                const btn = document.querySelector(`.table[data-table-id="${tId}"]`);
                if (!btn) return;
                const restoredCart = new Map(Array.isArray(data.items) ? data.items : []);
                const tData = {
                    cart: restoredCart,
                    itemsSentToKitchen: Boolean(data.itemsSentToKitchen),
                    tableName: data.tableName || btn.dataset.tableName,
                    area: data.area || btn.dataset.area,
                    arrivalTime: data.arrivalTime || '',
                    combinedWith: data.combinedWith || null,
                    surchargeAmount: Number(data.surchargeAmount) || 0,
                    orderDiscountAmount: Number(data.orderDiscountAmount) || 0,
                };
                tableOrders.set(String(tId), tData);
            });
        } catch (err) {
            // Ignore storage errors
        }
    };

    const getCsrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

    const showToast = (msg) => {
        if (!systemNotice) return;
        systemNotice.textContent = msg;
        systemNotice.hidden = false;
        window.clearTimeout(systemNoticeTimeout);
        systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
    };

    const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const updateTableLastPaidBadge = (tableButton) => {
        if (!tableButton) return;
        const tId = String(tableButton.dataset.tableId);
        const isOccupied = tableOrders.has(tId) || tableButton.classList.contains('occupied') || tableButton.classList.contains('table-green') || tableButton.classList.contains('table-red');
        const lastPaid = tableLastPaidMap.get(tId);
        let badge = tableButton.querySelector('.table-last-paid-time');
        const subEl = tableButton.querySelector('.table-card-sub');

        if (!isOccupied && lastPaid && lastPaid.paid_time_short) {
            if (!badge) {
                badge = document.createElement('small');
                badge.className = 'table-last-paid-time';
                tableButton.appendChild(badge);
            }
            badge.textContent = lastPaid.paid_time_short;
            badge.hidden = false;
            if (subEl) subEl.hidden = true;
        } else {
            if (badge) badge.remove();
            if (subEl) subEl.hidden = false;
        }
    };

    const updateAllTableLastPaidBadges = () => {
        document.querySelectorAll('.table').forEach((btn) => updateTableLastPaidBadge(btn));
    };

    const prependActivityLogRow = (log) => {
        if (!log) return;
        const scrollContainer = document.querySelector('#pos-live-activity-scroll') || document.querySelector('.activity-panel .activity-scroll');
        if (!scrollContainer) return;

        const emptyRow = scrollContainer.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();

        const rowEl = document.createElement('div');
        rowEl.className = 'activity-row';
        rowEl.title = `${log.formatted_time || ''} - ${log.action_display || ''}: ${log.description || ''}`;
        const color = log.action_color || '#1e293b';

        let chipClass = 'event-other';
        let chipStyle = `color: ${color}; font-weight: 700;`;
        if (log.action === 'edit_invoice' || log.action === 'update') {
            chipClass = 'event-edit';
            chipStyle = '';
        } else if (log.action === 'delete_invoice' || log.action === 'delete' || log.action === 'cancel_item' || log.action === 'delete_order') {
            chipClass = 'event-delete';
            chipStyle = '';
        } else if (log.action === 'return_item' || log.action === 'edit_price') {
            chipClass = 'event-cancel';
            chipStyle = '';
        } else if (log.action === 'shift_close' || log.action === 'login') {
            chipClass = 'event-payment';
            chipStyle = '';
        }

        const hasReasonInDesc = log.reason && log.description && (log.description.includes(`(${log.reason})`) || log.description.includes(`Lý do: ${log.reason}`));
        const reasonHtml = (log.reason && !hasReasonInDesc && log.action !== 'edit_invoice' && log.action !== 'delete_invoice')
            ? `<span class="activity-reason-tag" style="display: inline-block; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; border-radius: 4px; padding: 0 6px; font-size: 11px; margin-left: 6px;">Lý do: ${escapeHtml(log.reason)}</span>`
            : '';

        rowEl.innerHTML = `
            <time class="activity-time" style="font-weight: 600; color: ${color}; font-size: 11.5px;">${escapeHtml(log.time || '')}</time>
            <div>
                <span class="activity-event-chip ${chipClass}" style="${chipStyle}">${escapeHtml(log.action_display || '')}</span>
            </div>
            <div class="activity-detail-wrap" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span class="activity-desc-text" style="color: ${color}; font-size: 12px; font-weight: 500;">${escapeHtml(log.description || '')}</span>
                ${reasonHtml}
            </div>
            <div style="text-align: right; padding-right: 12px;">
                <strong class="activity-actor-text" style="color: ${color}; font-size: 12px; font-weight: 600;">${escapeHtml(log.actor_name || '')}</strong>
            </div>
        `;
        scrollContainer.prepend(rowEl);
        scrollContainer.scrollTop = 0;
    };
    window.prependPosLiveActivityLog = prependActivityLogRow;

    const postTableAction = async (payload) => {
        const url = orderColumn?.dataset.tableActionUrl || '/sales/tables/action/';
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (data && data.activity_log) {
                prependActivityLogRow(data.activity_log);
            }
            return data;
        } catch (err) {
            return { ok: false, error: err.message };
        }
    };

    const showTableSpeechBubble = (tableButton, text) => {
        if (!tableButton) return;
        document.querySelectorAll('.table-speech-bubble').forEach((el) => el.remove());
        const bubble = document.createElement('div');
        bubble.className = 'table-speech-bubble';
        bubble.textContent = text;
        tableButton.appendChild(bubble);
        window.setTimeout(() => {
            bubble.classList.add('fade-out');
            window.setTimeout(() => bubble.remove(), 350);
        }, 4200);
    };

    const cancelActiveTableTool = () => {
        activeTableTool = null;
        pendingTargetTable = null;
        tableToolButtons.forEach((btn) => btn.classList.remove('active'));
        if (tableToolHint) tableToolHint.hidden = true;
        document.querySelector('.table-sidebar')?.classList.remove('table-map-selecting');
    };

    const setActiveTableTool = (toolName) => {
        if (!selectedTableId) {
            showToast('Vui lòng mở bàn trước khi thực hiện thao tác này.');
            return;
        }
        if (activeTableTool === toolName) {
            cancelActiveTableTool();
            return;
        }
        activeTableTool = toolName;
        tableToolButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.tableTool === toolName);
        });
        document.querySelector('.table-sidebar')?.classList.add('table-map-selecting');
        const toolLabels = {
            transfer: 'Chuyển bàn: Nhấn chọn bàn đích trên sơ đồ bàn bên trái',
            import: 'Nhập bàn: Nhấn chọn bàn đích trên sơ đồ bàn bên trái',
            combine: 'Ghép bàn: Nhấn chọn bàn cần ghép trên sơ đồ bàn bên trái',
            split: 'Tách bàn: Nhấn chọn bàn đích trên sơ đồ bàn bên trái',
        };
        if (tableToolHint && tableToolHintText) {
            tableToolHintText.textContent = toolLabels[toolName] || 'Chọn bàn đích trên sơ đồ bàn...';
            tableToolHint.hidden = false;
        }
    };

    tableToolHintCancel?.addEventListener('click', cancelActiveTableTool);

    const setMenuUnlocked = (unlocked) => {
        menuUnlocked = unlocked;
        if (menuColumn) menuColumn.hidden = !unlocked;
        if (posLayout) posLayout.classList.toggle('menu-visible', unlocked);
        if (menuColumn) menuColumn.classList.toggle('menu-locked', !unlocked);
        if (selectionActions) selectionActions.hidden = !previewedTable || Boolean(selectedTableId);
        if (orderOpenActions) orderOpenActions.hidden = !selectedTableId;
        if (selectedTableId && orderMode) {
            const tData = tableOrders.get(selectedTableId);
            if (tData?.combinedWith) {
                orderMode.textContent = `Ghép với bàn ${tData.combinedWith}`;
            } else {
                orderMode.textContent = unlocked ? 'Đang gọi món' : 'Đang phục vụ';
            }
        }
    };

    const renderOpenAction = () => {
        if (!orderPrimaryAction) return;
        orderPrimaryAction.classList.remove('kitchen-action', 'payment-action');
        if (!cart.size) {
            orderPrimaryAction.textContent = 'Hủy bàn';
        } else if (itemsSentToKitchen) {
            orderPrimaryAction.textContent = 'Thanh toán';
            orderPrimaryAction.classList.add('payment-action');
        } else {
            orderPrimaryAction.textContent = 'Nhấn món > bếp';
            orderPrimaryAction.classList.add('kitchen-action');
        }
    };

    const getArrivalTime = () => new Intl.DateTimeFormat('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date());

    const updateReserveButtonUI = (tableButton) => {
        if (!tableButton || !btnTableReserveLabel || !btnTableReserve) return;
        const isReserved = tableButton.classList.contains('reserved');
        btnTableReserveLabel.textContent = isReserved ? 'Hủy đặt' : 'Đặt chỗ';
        btnTableReserve.classList.toggle('is-reserved', isReserved);
    };

    const setSecondaryActions = (isPreview, tableButton = previewedTable) => {
        cancelActiveTableTool();
        if (isPreview) {
            if (tableReserveActions) tableReserveActions.hidden = false;
            if (tableOpenTools) tableOpenTools.hidden = true;
            updateReserveButtonUI(tableButton);
        } else {
            if (tableReserveActions) tableReserveActions.hidden = true;
            if (tableOpenTools) tableOpenTools.hidden = false;
        }
    };

    const showTablePreview = (tableButton) => {
        if (!tableButton) return;
        previewedTable = tableButton;
        selectedTableId = null;
        cart = new Map();
        itemsSentToKitchen = false;

        document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected', 'preview'));
        tableButton.classList.add('preview');

        const tId = String(tableButton.dataset.tableId);
        const lastPaid = tableLastPaidMap.get(tId);
        const isReserved = tableButton.classList.contains('reserved');
        if (orderTitle) orderTitle.textContent = `Bàn ${tableButton.dataset.tableName} - ${tableButton.dataset.area}`;
        if (selectedTable) selectedTable.textContent = tableButton.dataset.tableName;
        if (orderTime) orderTime.textContent = getArrivalTime();
        if (orderStatus) {
            orderStatus.textContent = isReserved ? 'Đã đặt trước' : 'Trống';
            orderStatus.classList.toggle('pending', isReserved);
        }
        if (orderCustomer) orderCustomer.textContent = '-';
        if (orderRequestedBy && orderColumn) orderRequestedBy.textContent = orderColumn.dataset.currentUser;
        if (orderMode) orderMode.textContent = isReserved ? 'Đã đặt trước' : 'Chưa gọi món';
        if (orderItems) {
            let recentHtml = '';
            if (lastPaid && lastPaid.invoice_code) {
                recentHtml = `
                    <div class="last-served-info-box" id="btn-trigger-undo-last-served" role="button" tabindex="0" title="Nhấn để hoàn tác thanh toán cho bàn ${escapeHtml(tableButton.dataset.tableName)} (HĐ số ${escapeHtml(lastPaid.invoice_code)})">
                        <div class="last-served-title">Thời điểm phục vụ gần nhất</div>
                        <div class="last-served-detail">
                            <span class="last-served-datetime">${escapeHtml(lastPaid.paid_datetime_full || '')}</span>
                            <strong class="last-served-amount">${escapeHtml(lastPaid.total_formatted || `${Number(lastPaid.total_amount || 0).toLocaleString('vi-VN')} đ`)}</strong>
                        </div>
                    </div>
                `;
            }
            orderItems.innerHTML = `
                ${recentHtml}
                <p class="empty-order">${isReserved ? 'Bàn đã được đặt trước. Nhấn Mở bàn hoặc Gọi món khi khách vào.' : 'Bàn đang trống. Nhấn Mở bàn, Gọi món hoặc Đặt chỗ.'}</p>
            `;
            const recentBox = orderItems.querySelector('#btn-trigger-undo-last-served');
            if (recentBox && lastPaid) {
                recentBox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openUndoPaymentDialog({
                        invoice_code: lastPaid.invoice_code,
                        table_id: tId,
                        table_name: tableButton.dataset.tableName,
                    });
                });
            }
        }
        if (subtotalElement) subtotalElement.textContent = '0 đ';
        if (surchargeElement) surchargeElement.textContent = '0 đ';
        if (discountElement) discountElement.textContent = '0 đ';
        if (totalElement) totalElement.textContent = '0 đ';
        if (selectionPrimaryAction) selectionPrimaryAction.textContent = 'Mở bàn';
        if (selectionActions) selectionActions.hidden = false;
        if (orderOpenActions) orderOpenActions.hidden = true;
        setSecondaryActions(true, tableButton);
        setMenuUnlocked(false);
    };

    const showSelectedTable = (tableButton) => {
        if (!tableButton) return;
        const tableName = tableButton.dataset.tableName;
        const tData = tableOrders.get(tableButton.dataset.tableId);
        if (orderTitle) orderTitle.textContent = `Bàn ${tableName} - ${tableButton.dataset.area}`;
        if (selectedTable) selectedTable.textContent = tableName;
        if (orderTime) orderTime.textContent = tData?.arrivalTime || getArrivalTime();
        if (orderStatus) {
            if (tData?.combinedWith) {
                orderStatus.textContent = `Đang phục vụ (Ghép bàn ${tData.combinedWith})`;
                orderStatus.classList.add('pending');
            } else if (itemsSentToKitchen) {
                orderStatus.textContent = 'Đang phục vụ món';
                orderStatus.classList.add('pending');
            } else {
                orderStatus.textContent = 'Đang gọi món';
                orderStatus.classList.remove('pending');
            }
        }
        if (orderCustomer) orderCustomer.textContent = '-';
        if (orderRequestedBy && orderColumn) orderRequestedBy.textContent = orderColumn.dataset.currentUser;
    };

    const clearSelectedTable = () => {
        const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`) || previewedTable;
        const cancelingTableId = selectedTableId;
        if (selectedTableId) {
            tableOrders.delete(selectedTableId);
            saveTableOrdersToSession();
        }
        if (activeTable) {
            activeTable.classList.remove('selected', 'preview', 'table-opening', 'table-red', 'kitchen-sent', 'table-green', 'occupied', 'reserved');
            updateTableLastPaidBadge(activeTable);
        }
        if (cancelingTableId) {
            postTableAction({ action: 'cancel_open', source_table_id: cancelingTableId });
        }
        selectedTableId = null;
        cart = new Map();
        itemsSentToKitchen = false;
        setMenuUnlocked(false);
        renderCart();
        if (activeTable) {
            showTablePreview(activeTable);
        } else {
            if (orderTitle) orderTitle.textContent = 'Bàn -';
            if (selectedTable) selectedTable.textContent = '-';
            if (orderStatus) {
                orderStatus.textContent = 'Trống';
                orderStatus.classList.remove('pending');
            }
            if (orderMode) orderMode.textContent = '';
        }
        tablePreviewArmed = false;
    };

    const applyTableVisualState = (tableButton, tableData) => {
        if (!tableButton) return;
        tableButton.classList.remove('reserved', 'available');
        if (!tableData) {
            tableButton.classList.remove('table-opening', 'table-red', 'kitchen-sent', 'table-green', 'occupied');
            updateTableLastPaidBadge(tableButton);
            return;
        }
        if (tableData.itemsSentToKitchen) {
            tableButton.classList.remove('table-opening', 'table-red');
            tableButton.classList.add('kitchen-sent', 'table-green', 'occupied');
        } else {
            tableButton.classList.add('table-opening', 'table-red', 'occupied');
            tableButton.classList.remove('kitchen-sent', 'table-green');
        }
        updateTableLastPaidBadge(tableButton);
    };

    const openSelectedTable = (tableButton, options = {}) => {
        if (!tableButton) return;
        const shouldUnlockMenu = options.unlockMenu !== undefined ? Boolean(options.unlockMenu) : true;
        cancelActiveTableTool();
        selectedTableId = String(tableButton.dataset.tableId);
        previewedTable = tableButton;

        document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected', 'preview'));
        tableButton.classList.add('selected');
        tableButton.classList.remove('reserved');

        let tableData = tableOrders.get(selectedTableId);
        const isNewlyOpened = !tableData;
        if (!tableData) {
            tableData = {
                cart: new Map(),
                itemsSentToKitchen: false,
                tableName: tableButton.dataset.tableName,
                area: tableButton.dataset.area,
                arrivalTime: getArrivalTime(),
                combinedWith: null,
                surchargeAmount: 0,
                orderDiscountAmount: 0,
            };
            tableOrders.set(selectedTableId, tableData);
        }

        cart = tableData.cart;
        itemsSentToKitchen = tableData.itemsSentToKitchen;

        applyTableVisualState(tableButton, tableData);
        saveTableOrdersToSession();
        if (isNewlyOpened && !options.skipLog) {
            postTableAction({ action: 'open', source_table_id: selectedTableId });
        }

        showSelectedTable(tableButton);
        if (selectionPrimaryAction) selectionPrimaryAction.textContent = 'Hủy bàn';
        setSecondaryActions(false, tableButton);
        setMenuUnlocked(shouldUnlockMenu);
        renderCart();
    };

    // =========================================================================
    // ĐẶT BÀN / HỦY ĐẶT BÀN (RESERVE / UNRESERVE TABLE)
    // =========================================================================
    btnTableReserve?.addEventListener('click', async () => {
        const targetBtn = previewedTable || document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        if (!targetBtn) return;
        const tableId = targetBtn.dataset.tableId;
        const isCurrentlyReserved = targetBtn.classList.contains('reserved');
        const action = isCurrentlyReserved ? 'unreserve' : 'reserve';

        if (isCurrentlyReserved) {
            targetBtn.classList.remove('reserved');
        } else {
            targetBtn.classList.add('reserved');
        }
        showTablePreview(targetBtn);
        await postTableAction({ action, source_table_id: tableId });
    });

    // =========================================================================
    // CHUYỂN, NHẬP, GHÉP, TÁCH BÀN (TRANSFER, IMPORT, COMBINE, SPLIT)
    // =========================================================================
    const tableConfirmDialog = document.querySelector('#table-action-confirm-dialog');
    const tableConfirmTitle = document.querySelector('#table-action-confirm-title');
    const tableConfirmMsg = document.querySelector('#table-action-confirm-msg');
    const tableConfirmOk = document.querySelector('#table-action-confirm-ok');
    const tableConfirmCancel = document.querySelector('#table-action-confirm-cancel');
    const tableConfirmClose = document.querySelector('#table-action-confirm-close');

    const tableSplitDialog = document.querySelector('#table-split-dialog');
    const splitSourceTableName = document.querySelector('#split-source-table-name');
    const splitTargetTableSelect = document.querySelector('#split-target-table-select');
    const splitItemsList = document.querySelector('#split-items-list');
    const tableSplitOk = document.querySelector('#table-split-ok');
    const tableSplitCancel = document.querySelector('#table-split-cancel');
    const tableSplitClose = document.querySelector('#table-split-close');
    let splitQuantities = new Map();

    const closeTableConfirmDialog = () => {
        if (tableConfirmDialog) tableConfirmDialog.hidden = true;
        pendingTargetTable = null;
    };

    const closeTableSplitDialog = () => {
        if (tableSplitDialog) tableSplitDialog.hidden = true;
        pendingTargetTable = null;
        splitQuantities.clear();
    };

    const openTableConfirmModal = (tool, targetButton) => {
        const sourceButton = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        if (!sourceButton || !targetButton || !tableConfirmDialog) return;
        pendingTargetTable = targetButton;
        const sName = sourceButton.dataset.tableName;
        const tName = targetButton.dataset.tableName;

        if (tool === 'transfer') {
            if (tableConfirmTitle) tableConfirmTitle.textContent = 'Chuyển bàn';
            if (tableConfirmMsg) tableConfirmMsg.textContent = `Chuyển từ bàn ${sName} đến bàn ${tName}, Nhấn OK để xác nhận!`;
        } else if (tool === 'import') {
            if (tableConfirmTitle) tableConfirmTitle.textContent = 'Nhập bàn';
            if (tableConfirmMsg) tableConfirmMsg.textContent = `Nhập từ bàn ${sName} vào bàn ${tName}, Nhấn OK để xác nhận!`;
        } else if (tool === 'combine') {
            if (tableConfirmTitle) tableConfirmTitle.textContent = 'Ghép bàn';
            if (tableConfirmMsg) tableConfirmMsg.textContent = `Ghép bàn ${sName} với bàn ${tName}, Nhấn OK để xác nhận!`;
        }
        tableConfirmDialog.hidden = false;
    };

    const cloneCartMap = (sourceCart) => {
        const next = new Map();
        sourceCart.forEach((item, key) => {
            next.set(String(key), { ...item });
        });
        return next;
    };

    const mergeCartInto = (targetCart, sourceCart) => {
        sourceCart.forEach((item, key) => {
            const k = String(key);
            const existing = targetCart.get(k);
            if (existing) {
                existing.quantity += item.quantity;
            } else {
                targetCart.set(k, { ...item });
            }
        });
    };

    tableConfirmOk?.addEventListener('click', async () => {
        const sourceButton = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        const targetButton = pendingTargetTable;
        const tool = activeTableTool;
        if (!sourceButton || !targetButton || !tool) {
            closeTableConfirmDialog();
            return;
        }

        const sourceId = sourceButton.dataset.tableId;
        const targetId = targetButton.dataset.tableId;
        const sName = sourceButton.dataset.tableName;
        const tName = targetButton.dataset.tableName;
        const sourceData = tableOrders.get(sourceId) || {
            cart: cloneCartMap(cart),
            itemsSentToKitchen,
            tableName: sName,
            area: sourceButton.dataset.area,
            arrivalTime: getArrivalTime(),
            combinedWith: null,
        };

        closeTableConfirmDialog();
        cancelActiveTableTool();

        if (tool === 'transfer') {
            let targetData = tableOrders.get(targetId);
            if (!targetData) {
                targetData = {
                    cart: cloneCartMap(sourceData.cart),
                    itemsSentToKitchen: sourceData.itemsSentToKitchen,
                    tableName: tName,
                    area: targetButton.dataset.area,
                    arrivalTime: sourceData.arrivalTime || getArrivalTime(),
                    combinedWith: sourceData.combinedWith,
                };
            } else {
                mergeCartInto(targetData.cart, sourceData.cart);
                targetData.itemsSentToKitchen = targetData.itemsSentToKitchen || sourceData.itemsSentToKitchen;
            }
            tableOrders.set(targetId, targetData);
            tableOrders.delete(sourceId);
            saveTableOrdersToSession();

            applyTableVisualState(sourceButton, null);
            applyTableVisualState(targetButton, targetData);

            showTablePreview(sourceButton);
            showTableSpeechBubble(sourceButton, `Đã chuyển sang bàn ${tName}!`);
            await postTableAction({
                action: 'transfer',
                source_table_id: sourceId,
                target_table_id: targetId,
                detail: `Chuyển từ bàn ${sName} sang bàn ${tName}`,
            });
        } else if (tool === 'import') {
            let targetData = tableOrders.get(targetId);
            if (!targetData) {
                targetData = {
                    cart: cloneCartMap(sourceData.cart),
                    itemsSentToKitchen: sourceData.itemsSentToKitchen,
                    tableName: tName,
                    area: targetButton.dataset.area,
                    arrivalTime: sourceData.arrivalTime || getArrivalTime(),
                    combinedWith: null,
                };
            } else {
                mergeCartInto(targetData.cart, sourceData.cart);
                targetData.itemsSentToKitchen = targetData.itemsSentToKitchen || sourceData.itemsSentToKitchen;
            }
            tableOrders.set(targetId, targetData);
            tableOrders.delete(sourceId);
            saveTableOrdersToSession();

            applyTableVisualState(sourceButton, null);
            applyTableVisualState(targetButton, targetData);

            openSelectedTable(targetButton);
            showTableSpeechBubble(sourceButton, `Đã nhập vào bàn ${tName}!`);
            await postTableAction({
                action: 'import',
                source_table_id: sourceId,
                target_table_id: targetId,
                detail: `Nhập từ bàn ${sName} vào bàn ${tName}`,
            });
        } else if (tool === 'combine') {
            sourceData.combinedWith = tName;
            tableOrders.set(sourceId, sourceData);
            let targetData = tableOrders.get(targetId);
            if (!targetData) {
                targetData = {
                    cart: cloneCartMap(sourceData.cart),
                    itemsSentToKitchen: sourceData.itemsSentToKitchen,
                    tableName: tName,
                    area: targetButton.dataset.area,
                    arrivalTime: sourceData.arrivalTime || getArrivalTime(),
                    combinedWith: sName,
                };
            } else {
                targetData.combinedWith = sName;
            }
            tableOrders.set(targetId, targetData);
            saveTableOrdersToSession();

            applyTableVisualState(sourceButton, sourceData);
            applyTableVisualState(targetButton, targetData);

            showSelectedTable(sourceButton);
            setMenuUnlocked(menuUnlocked);
            showTableSpeechBubble(targetButton, `Đã ghép với bàn ${sName}!`);
            await postTableAction({
                action: 'combine',
                source_table_id: sourceId,
                target_table_id: targetId,
                detail: `Ghép bàn ${sName} với bàn ${tName}`,
            });
        }
    });

    tableConfirmCancel?.addEventListener('click', closeTableConfirmDialog);
    tableConfirmClose?.addEventListener('click', closeTableConfirmDialog);

    const renderSplitModalItems = () => {
        if (!splitItemsList) return;
        splitItemsList.innerHTML = '';
        if (!cart.size) {
            splitItemsList.innerHTML = '<p class="empty-order">Bàn hiện tại chưa có món nào để tách.</p>';
            return;
        }
        cart.forEach((item, productId) => {
            const k = String(productId);
            const splitQty = splitQuantities.get(k) || 0;
            const row = document.createElement('div');
            row.className = 'split-item-row';
            row.innerHTML = `
                <div class="split-item-info">
                    <strong>${item.name}</strong>
                    <small>Đang có: ${item.quantity} ${item.unit}</small>
                </div>
                <div class="split-item-qty-control">
                    <button type="button" class="btn-split-minus" data-id="${k}">&minus;</button>
                    <span class="split-qty-val">${splitQty}</span>
                    <button type="button" class="btn-split-plus" data-id="${k}">&plus;</button>
                </div>
            `;
            splitItemsList.appendChild(row);
        });

        splitItemsList.querySelectorAll('.btn-split-minus').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const cur = splitQuantities.get(id) || 0;
                splitQuantities.set(id, Math.max(0, cur - 1));
                renderSplitModalItems();
            });
        });

        splitItemsList.querySelectorAll('.btn-split-plus').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const item = cart.get(id);
                if (!item) return;
                const cur = splitQuantities.get(id) || 0;
                splitQuantities.set(id, Math.min(item.quantity, cur + 1));
                renderSplitModalItems();
            });
        });
    };

    const openTableSplitModal = (preselectedTargetBtn = null) => {
        const sourceButton = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        if (!sourceButton || !tableSplitDialog) return;
        if (!cart.size) {
            showToast('Bàn hiện tại chưa có món nào để tách.');
            cancelActiveTableTool();
            return;
        }

        if (splitSourceTableName) {
            splitSourceTableName.textContent = `Bàn ${sourceButton.dataset.tableName}`;
        }

        if (splitTargetTableSelect) {
            splitTargetTableSelect.innerHTML = '';
            document.querySelectorAll('.table').forEach((btn) => {
                if (btn.dataset.tableId === selectedTableId) return;
                const opt = document.createElement('option');
                opt.value = btn.dataset.tableId;
                opt.textContent = `Bàn ${btn.dataset.tableName} (${btn.dataset.area})`;
                if (preselectedTargetBtn && btn.dataset.tableId === preselectedTargetBtn.dataset.tableId) {
                    opt.selected = true;
                }
                splitTargetTableSelect.appendChild(opt);
            });
        }

        splitQuantities.clear();
        let firstAssigned = false;
        cart.forEach((item, productId) => {
            if (!firstAssigned) {
                splitQuantities.set(String(productId), 1);
                firstAssigned = true;
            } else {
                splitQuantities.set(String(productId), 0);
            }
        });

        renderSplitModalItems();
        tableSplitDialog.hidden = false;
    };

    tableSplitOk?.addEventListener('click', async () => {
        const sourceButton = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        const targetId = splitTargetTableSelect?.value;
        const targetButton = targetId ? document.querySelector(`.table[data-table-id="${targetId}"]`) : null;
        if (!sourceButton || !targetButton) {
            closeTableSplitDialog();
            return;
        }

        let totalSplitItems = 0;
        splitQuantities.forEach((qty) => { totalSplitItems += qty; });
        if (totalSplitItems <= 0) {
            showToast('Vui lòng chọn ít nhất 1 món để tách sang bàn đích.');
            return;
        }

        const sourceId = sourceButton.dataset.tableId;
        const sName = sourceButton.dataset.tableName;
        const tName = targetButton.dataset.tableName;

        let targetData = tableOrders.get(targetId);
        if (!targetData) {
            targetData = {
                cart: new Map(),
                itemsSentToKitchen: itemsSentToKitchen,
                tableName: tName,
                area: targetButton.dataset.area,
                arrivalTime: getArrivalTime(),
                combinedWith: null,
            };
        }

        splitQuantities.forEach((qty, productId) => {
            if (qty <= 0) return;
            const srcItem = cart.get(productId);
            if (!srcItem) return;
            const existingTarget = targetData.cart.get(productId);
            if (existingTarget) {
                existingTarget.quantity += qty;
            } else {
                targetData.cart.set(productId, { ...srcItem, quantity: qty });
            }

            if (srcItem.quantity > qty) {
                srcItem.quantity -= qty;
            } else {
                cart.delete(productId);
            }
        });

        tableOrders.set(targetId, targetData);
        applyTableVisualState(targetButton, targetData);

        closeTableSplitDialog();
        cancelActiveTableTool();

        if (cart.size === 0) {
            tableOrders.delete(sourceId);
            saveTableOrdersToSession();
            applyTableVisualState(sourceButton, null);
            openSelectedTable(targetButton);
        } else {
            const sourceData = tableOrders.get(sourceId);
            if (sourceData) sourceData.cart = cart;
            saveTableOrdersToSession();
            renderCart();
        }

        showTableSpeechBubble(sourceButton, `Đã tách sang bàn ${tName}!`);
        await postTableAction({
            action: 'split',
            source_table_id: sourceId,
            target_table_id: targetId,
            detail: `Tách từ bàn ${sName} sang bàn ${tName}`,
        });
    });

    tableSplitCancel?.addEventListener('click', closeTableSplitDialog);
    tableSplitClose?.addEventListener('click', closeTableSplitDialog);

    tableToolButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tableTool;
            if (!tool) return;
            setActiveTableTool(tool);
        });
    });

    const closeDialog = () => {
        dialog.hidden = true;
        dialogProduct = null;
        editingCartItemId = null;
    };

    const getItemGrossTotal = (item) => (Number(item.price) || 0) * (Number(item.quantity) || 0);
    const getItemDiscountAmount = (item) => {
        const gross = getItemGrossTotal(item);
        const pct = Math.min(100, Math.max(0, Number(item.discount_percent) || 0));
        if (pct > 0) {
            return Math.round((gross * pct) / 100);
        }
        return Math.min(gross, Math.max(0, Number(item.discount_amount) || 0));
    };
    const getItemNetTotal = (item) => Math.max(0, getItemGrossTotal(item) - getItemDiscountAmount(item));

    const getCartSummary = () => {
        let subtotal = 0;
        let itemDiscounts = 0;
        cart.forEach((item) => {
            subtotal += getItemGrossTotal(item);
            itemDiscounts += getItemDiscountAmount(item);
        });
        const tData = selectedTableId ? tableOrders.get(String(selectedTableId)) : null;
        const surcharge = Number(tData?.surchargeAmount) || 0;
        const orderDiscount = Number(tData?.orderDiscountAmount) || 0;
        const totalDiscount = itemDiscounts + orderDiscount;
        const total = Math.max(0, subtotal + surcharge - totalDiscount);
        return { subtotal, surcharge, totalDiscount, total };
    };

    const getCartTotal = () => getCartSummary().total;
    const cashPaidGroup = document.querySelector('#payment-cash-paid-group');
    const cashChangeGroup = document.querySelector('#payment-cash-change-group');

    const updateChangeAmount = () => {
        const total = getCartTotal();
        const isCash = !paymentMethodDialog || paymentMethodDialog.value === 'cash';
        if (cashPaidGroup) cashPaidGroup.hidden = !isCash;
        if (cashChangeGroup) cashChangeGroup.hidden = !isCash;

        const rawVal = String(customerPaid.value || '').trim();
        const paid = rawVal === '' ? total : (Number(rawVal) || 0);
        const change = Math.max(paid - total, 0);
        changeAmount.value = formatMoney(change);
        paymentConfirm.disabled = false;
    };
    const openPaymentDialog = () => {
        const total = getCartTotal();
        paymentDialog.querySelector('#payment-dialog-title').textContent = `Bàn ${selectedTable.textContent} - Thanh toán`;
        paymentTotal.textContent = formatMoney(total);
        if (paymentMethodDialog) {
            paymentMethodDialog.value = 'cash';
        }
        customerPaid.value = total;
        updateChangeAmount();
        paymentDialog.hidden = false;
        customerPaid.focus();
        customerPaid.select();
    };
    const closePaymentDialog = () => { paymentDialog.hidden = true; };
    customerPaid.addEventListener('input', updateChangeAmount);
    paymentMethodDialog?.addEventListener('change', () => {
        updateChangeAmount();
        if (paymentMethodDialog.value === 'cash') {
            customerPaid.focus();
            customerPaid.select();
        }
    });
    document.querySelector('#payment-dialog-close').addEventListener('click', closePaymentDialog);
    document.querySelector('#payment-cancel').addEventListener('click', closePaymentDialog);
    paymentConfirm.addEventListener('click', async () => {
        const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        paymentConfirm.disabled = true;
        try {
            const csrfToken = getCsrfToken();
            const tData = selectedTableId ? tableOrders.get(String(selectedTableId)) : null;
            const response = await fetch(paymentDialog.dataset.checkoutUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify({
                    items: Array.from(cart.values()).map((item) => ({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        unit_price: item.price,
                        discount_percent: item.discount_percent || 0,
                        discount_amount: getItemDiscountAmount(item),
                        note: item.note || '',
                    })),
                    surcharge_amount: Number(tData?.surchargeAmount) || 0,
                    discount_amount: Number(tData?.orderDiscountAmount) || 0,
                    payment_method: paymentMethodDialog.value,
                    table_id: selectedTableId,
                    order_type: 'dine_in',
                }),
            });
            let result = {};
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                result = await response.json();
            } else if (!response.ok) {
                throw new Error('Không thể hoàn tất thanh toán (Lỗi phân quyền hoặc phiên đăng nhập).');
            }
            if (!response.ok) throw new Error(result.error || 'Không thể hoàn tất thanh toán.');
            if (activeTable) {
                activeTable.classList.remove('selected', 'preview', 'table-opening', 'table-red', 'kitchen-sent', 'table-green', 'occupied');
            }
            if (selectedTableId) {
                tableOrders.delete(String(selectedTableId));
                saveTableOrdersToSession();
            }
            closePaymentDialog();
            window.location.reload();
        } catch (error) {
            systemNotice.textContent = error.message;
            systemNotice.hidden = false;
            paymentConfirm.disabled = false;
        }
    });

    document.querySelectorAll('.pos-menu-item').forEach((menuItem) => {
        const menuButton = menuItem.querySelector('button.nav-menu-btn') || menuItem.querySelector(':scope > button');
        if (!menuButton) return;
        menuButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            const wasOpen = menuItem.classList.contains('open');
            document.querySelectorAll('.pos-menu-item').forEach((menu) => {
                menu.classList.remove('open');
                const btn = menu.querySelector('button.nav-menu-btn') || menu.querySelector(':scope > button');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            });
            if (!wasOpen) {
                menuItem.classList.add('open');
                menuButton.setAttribute('aria-expanded', 'true');
            }
        };
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.pos-menu-item')) {
            document.querySelectorAll('.pos-menu-item').forEach((menu) => {
                menu.classList.remove('open');
                const button = menu.querySelector('button.nav-menu-btn') || menu.querySelector(':scope > button');
                if (button) button.setAttribute('aria-expanded', 'false');
            });
        }
    });

    const systemNotice = document.querySelector('#system-notice');
    const closingDialog = document.querySelector('#closing-dialog');
    const closingSuccessDialog = document.querySelector('#closing-success-dialog');
    const closingConfirm = document.querySelector('#closing-confirm');
    const passwordDialog = document.querySelector('#password-dialog');
    const passwordDialogBackdrop = document.querySelector('#password-dialog-backdrop');
    const passwordDialogClose = document.querySelector('#password-dialog-close');
    const passwordChangeForm = document.querySelector('#password-change-form');
    const passwordConfirmButton = document.querySelector('#password-confirm-button');
    const passwordAlertEl = document.querySelector('#password-change-alert');
    const passwordMatchHint = document.querySelector('#password-match-hint');
    const passwordInputs = [
        document.querySelector('#password-old'),
        document.querySelector('#password-new'),
        document.querySelector('#password-confirm'),
    ].filter(Boolean);

    const hidePasswordAlert = () => {
        if (!passwordAlertEl) return;
        passwordAlertEl.hidden = true;
        passwordAlertEl.textContent = '';
        passwordAlertEl.className = 'password-feedback-alert';
    };

    const showPasswordAlert = (msg, isSuccess = false) => {
        if (!passwordAlertEl) return;
        passwordAlertEl.textContent = msg;
        passwordAlertEl.className = `password-feedback-alert ${isSuccess ? 'is-success' : 'is-error'}`;
        passwordAlertEl.hidden = false;
    };

    const resetPasswordVisibility = () => {
        passwordInputs.forEach((inp) => { inp.type = 'password'; });
        passwordChangeForm?.querySelectorAll('.btn-toggle-pwd').forEach((btn) => {
            btn.classList.remove('active');
        });
    };

    const closePasswordDialog = () => {
        if (passwordDialog) passwordDialog.hidden = true;
        passwordChangeForm?.reset();
        resetPasswordVisibility();
        hidePasswordAlert();
        if (passwordMatchHint) {
            passwordMatchHint.hidden = true;
            passwordMatchHint.textContent = '';
        }
        if (passwordConfirmButton) {
            passwordConfirmButton.disabled = true;
            passwordConfirmButton.textContent = 'Xác nhận đổi mật khẩu';
        }
    };

    const updatePasswordButton = () => {
        const [oldPassword, newPassword, confirmation] = passwordInputs.map((input) => input.value);
        hidePasswordAlert();
        if (passwordMatchHint) {
            if (!confirmation) {
                passwordMatchHint.hidden = true;
            } else if (newPassword === confirmation) {
                passwordMatchHint.textContent = '✓ Mật khẩu xác nhận khớp';
                passwordMatchHint.className = 'password-match-hint is-match';
                passwordMatchHint.hidden = false;
            } else {
                passwordMatchHint.textContent = '⚠ Mật khẩu xác nhận chưa khớp';
                passwordMatchHint.className = 'password-match-hint is-mismatch';
                passwordMatchHint.hidden = false;
            }
        }
        if (passwordConfirmButton) {
            passwordConfirmButton.disabled = !oldPassword || !newPassword || newPassword !== confirmation;
        }
    };

    document.querySelector('.password-change-action')?.addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelector('.system-menu')?.classList.remove('open');
        document.querySelector('.system-menu > button')?.setAttribute('aria-expanded', 'false');
        closePasswordDialog();
        if (passwordDialog) passwordDialog.hidden = false;
        window.setTimeout(() => passwordInputs[0]?.focus(), 40);
    });

    passwordInputs.forEach((input) => input.addEventListener('input', updatePasswordButton));
    document.querySelector('#password-cancel-button')?.addEventListener('click', closePasswordDialog);
    passwordDialogClose?.addEventListener('click', closePasswordDialog);
    passwordDialogBackdrop?.addEventListener('click', closePasswordDialog);

    passwordChangeForm?.querySelectorAll('.btn-toggle-pwd').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;
            const isPwd = input.type === 'password';
            input.type = isPwd ? 'text' : 'password';
            btn.classList.toggle('active', isPwd);
            input.focus();
        });
    });

    passwordChangeForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const [oldPassword, newPassword, confirmation] = passwordInputs.map((input) => input.value);
        if (!oldPassword || !newPassword || newPassword !== confirmation) return;

        if (passwordConfirmButton) {
            passwordConfirmButton.disabled = true;
            passwordConfirmButton.textContent = 'Đang xử lý...';
        }
        hidePasswordAlert();

        try {
            const formData = new FormData(passwordChangeForm);
            const response = await fetch(passwordChangeForm.action, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: formData,
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                showPasswordAlert(result.error || 'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.', false);
                if (passwordConfirmButton) {
                    passwordConfirmButton.disabled = false;
                    passwordConfirmButton.textContent = 'Xác nhận đổi mật khẩu';
                }
                return;
            }
            showPasswordAlert(result.message || 'Đã cập nhật mật khẩu mới thành công!', true);
            showToast(result.message || 'Đã cập nhật mật khẩu mới thành công!');
            window.setTimeout(() => {
                closePasswordDialog();
            }, 650);
        } catch (err) {
            showPasswordAlert('Lỗi kết nối máy chủ khi đổi mật khẩu.', false);
            if (passwordConfirmButton) {
                passwordConfirmButton.disabled = false;
                passwordConfirmButton.textContent = 'Xác nhận đổi mật khẩu';
            }
        }
    });
    const closeClosingDialog = () => { closingDialog.hidden = true; };
    const systemMessages = {
        shift: 'Đã mở chức năng đăng thoát / ra ca. Dữ liệu ca được lưu khi kết ca.',
        closing: 'Chức năng kết ca và đổi tiền đã được chọn.',
        'customer-credit': 'Chức năng nạp tiền khách hàng cần được cấu hình theo chương trình thành viên.',
        drawer: 'Không tìm thấy thiết bị két tiền được kết nối.',
        device: 'Thiết bị POS: máy in POS-80C đang sẵn sàng.',
        maintenance: 'Bảo trì dữ liệu chỉ dành cho quản trị viên. Hãy sao lưu trước khi thực hiện.',
    };
    let systemNoticeTimeout;
    document.querySelectorAll('.system-action').forEach((actionButton) => {
        actionButton.addEventListener('click', () => {
            const menu = actionButton.closest('.pos-menu-item');
            menu.classList.remove('open');
            menu.querySelector(':scope > button').setAttribute('aria-expanded', 'false');
            if (actionButton.dataset.action === 'closing') {
                closingDialog.hidden = false;
                return;
            }
            showToast(systemMessages[actionButton.dataset.action]);
        });
    });
    document.querySelector('#closing-dialog-close').addEventListener('click', closeClosingDialog);
    document.querySelector('#closing-cancel').addEventListener('click', closeClosingDialog);
    closingConfirm.addEventListener('click', async () => {
        closingConfirm.disabled = true;
        try {
            const response = await fetch(closingDialog.dataset.closeUrl, {
                method: 'POST',
                headers: { 'X-CSRFToken': getCsrfToken() },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Không thể kết ca.');
            closingDialog.hidden = true;
            closingSuccessDialog.hidden = false;
            window.setTimeout(() => document.querySelector('#closing-logout-form').submit(), 1200);
        } catch (error) {
            showToast(error.message);
            closingConfirm.disabled = false;
        }
    });

    const settingMessages = {
        'price-policy': 'Chính sách giá và sự kiện sẽ được cấu hình trong mô-đun khuyến mãi.',
        coupon: 'Chức năng mã giảm giá đang chờ cấu hình quy tắc áp dụng.',
        options: 'Các tùy chọn hệ thống sẽ được mở trong phiên bản cấu hình tiếp theo.',
    };
    document.querySelectorAll('.settings-action').forEach((actionButton) => {
        actionButton.addEventListener('click', () => {
            const menu = actionButton.closest('.pos-menu-item');
            menu.classList.remove('open');
            menu.querySelector(':scope > button').setAttribute('aria-expanded', 'false');
            showToast(settingMessages[actionButton.dataset.setting]);
        });
    });

    // =========================================================================
    // CONTEXT MENU HÓA ĐƠN: TÍNH LẠI TIỀN THỪA, SỬA, XÓA HÓA ĐƠN
    // =========================================================================
    const invoiceContextMenu = document.querySelector('#invoice-context-menu');
    const invoiceDeleteDialog = document.querySelector('#invoice-delete-dialog');
    const invoiceDeleteReason = document.querySelector('#invoice-delete-reason');
    const invoiceDeleteConfirm = document.querySelector('#invoice-delete-confirm');
    const invoiceChangeDialog = document.querySelector('#invoice-change-dialog');
    const recalcInvoiceCodeEl = document.querySelector('#recalc-invoice-code');
    const recalcInvoiceTotalEl = document.querySelector('#recalc-invoice-total');
    const recalcCustomerPaidInput = document.querySelector('#recalc-customer-paid');
    const recalcChangeAmountInput = document.querySelector('#recalc-change-amount');
    let recalcInvoiceTotalAmount = 0;
    let selectedInvoiceRow = null;
    let targetInvoiceRowForAction = null;

    const invoiceActionMessages = {
        print: 'Đang in lại hóa đơn.',
        complete: 'Hóa đơn đã được đánh dấu hoàn tất thanh toán.',
        summary: 'Đã chọn tổng hợp hóa đơn.',
    };

    const parseMoneyText = (txt) => {
        if (!txt) return 0;
        const digits = String(txt).replace(/[^\d]/g, '');
        return Number(digits) || 0;
    };

    const closeInvoiceContextMenu = () => {
        if (invoiceContextMenu) invoiceContextMenu.hidden = true;
        if (selectedInvoiceRow) selectedInvoiceRow.classList.remove('invoice-selected');
    };

    const getRowInvoiceCode = (row) => {
        if (!row) return '';
        return row.dataset.invoiceCode || row.querySelector('td')?.textContent?.trim()?.replace(/^#/, '') || '';
    };

    const openInvoiceEditDialog = () => {
        const row = selectedInvoiceRow;
        const code = getRowInvoiceCode(row);
        closeInvoiceContextMenu();
        if (!code || typeof window.openInvoiceEditor !== 'function') return;
        const doOpen = () => window.openInvoiceEditor(code);
        if (typeof window.requirePosPermission === 'function') {
            window.requirePosPermission('edit_delete_invoice', doOpen, 'Sửa hóa đơn');
        } else {
            doOpen();
        }
    };

    // --- TÍNH LẠI TIỀN THỪA ---
    const updateRecalcChangeOutput = () => {
        if (!recalcCustomerPaidInput || !recalcChangeAmountInput) return;
        const paid = Number(recalcCustomerPaidInput.value) || 0;
        const diff = paid - recalcInvoiceTotalAmount;
        if (diff >= 0) {
            recalcChangeAmountInput.value = formatMoney(diff);
            recalcChangeAmountInput.classList.remove('is-negative');
        } else {
            recalcChangeAmountInput.value = `Còn thiếu ${formatMoney(Math.abs(diff))}`;
            recalcChangeAmountInput.classList.add('is-negative');
        }
    };

    const openInvoiceChangeDialog = () => {
        const row = selectedInvoiceRow;
        if (!row || !invoiceChangeDialog) return;
        targetInvoiceRowForAction = row;
        const code = getRowInvoiceCode(row);
        const amountEl = row.querySelector('.total-highlight') || row.querySelector('.td-amount') || row.children[6];
        const parsedFromDom = parseMoneyText(amountEl?.textContent);
        const parsedFromDataset = parseMoneyText(row.dataset.totalAmount);
        recalcInvoiceTotalAmount = parsedFromDom || parsedFromDataset || 0;

        if (recalcInvoiceCodeEl) recalcInvoiceCodeEl.textContent = `#${code}`;
        if (recalcInvoiceTotalEl) recalcInvoiceTotalEl.textContent = formatMoney(recalcInvoiceTotalAmount);
        if (recalcCustomerPaidInput) {
            recalcCustomerPaidInput.value = recalcInvoiceTotalAmount;
        }
        updateRecalcChangeOutput();
        closeInvoiceContextMenu();
        invoiceChangeDialog.hidden = false;
        window.setTimeout(() => {
            recalcCustomerPaidInput?.focus();
            recalcCustomerPaidInput?.select();
        }, 40);
    };

    const closeInvoiceChangeDialog = () => {
        if (invoiceChangeDialog) invoiceChangeDialog.hidden = true;
    };

    recalcCustomerPaidInput?.addEventListener('input', updateRecalcChangeOutput);
    document.querySelectorAll('#recalc-quick-cash button[data-cash]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const cashVal = Number(btn.dataset.cash) || 0;
            if (recalcCustomerPaidInput) {
                recalcCustomerPaidInput.value = cashVal;
                updateRecalcChangeOutput();
            }
        });
    });
    document.querySelector('#invoice-change-close')?.addEventListener('click', closeInvoiceChangeDialog);
    document.querySelector('#invoice-change-cancel')?.addEventListener('click', closeInvoiceChangeDialog);
    document.querySelector('#invoice-change-confirm')?.addEventListener('click', () => {
        const code = getRowInvoiceCode(targetInvoiceRowForAction);
        const paid = Number(recalcCustomerPaidInput?.value) || 0;
        const change = Math.max(0, paid - recalcInvoiceTotalAmount);
        closeInvoiceChangeDialog();
        showToast(`HĐ #${code}: Khách đưa ${formatMoney(paid)} — Tiền thừa trả khách: ${formatMoney(change)}`);
    });

    // --- LÝ DO XÓA HÓA ĐƠN (ĐỒNG BỘ VỚI LÝ DO SỬA HÓA ĐƠN) ---
    const openInvoiceDeleteDialog = () => {
        const row = selectedInvoiceRow;
        if (!row || !invoiceDeleteDialog) return;
        targetInvoiceRowForAction = row;
        const invoiceCode = getRowInvoiceCode(row);
        closeInvoiceContextMenu();

        const doOpenDelete = () => {
            const titleEl = document.querySelector('#invoice-delete-title');
            if (titleEl) titleEl.textContent = `Lý do xóa hóa đơn`;
            if (invoiceDeleteReason) {
                invoiceDeleteReason.value = '';
                invoiceDeleteReason.placeholder = `Nhập lý do xóa hóa đơn #${invoiceCode}...`;
            }
            if (invoiceDeleteConfirm) {
                invoiceDeleteConfirm.disabled = true;
                invoiceDeleteConfirm.textContent = 'Xác nhận';
            }
            invoiceDeleteDialog.hidden = false;
            window.setTimeout(() => invoiceDeleteReason?.focus(), 40);
        };

        if (typeof window.requirePosPermission === 'function') {
            window.requirePosPermission('edit_delete_invoice', doOpenDelete, 'Xóa hóa đơn');
        } else {
            doOpenDelete();
        }
    };

    const closeInvoiceDeleteDialog = () => {
        if (invoiceDeleteDialog) invoiceDeleteDialog.hidden = true;
    };

    invoiceDeleteReason?.addEventListener('input', () => {
        if (invoiceDeleteConfirm) {
            invoiceDeleteConfirm.disabled = !invoiceDeleteReason.value.trim();
        }
    });

    invoiceDeleteReason?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && invoiceDeleteReason.value.trim()) {
            e.preventDefault();
            invoiceDeleteConfirm?.click();
        }
    });

    const showInvoiceContextMenu = (event, row) => {
        event.preventDefault();
        if (selectedInvoiceRow) selectedInvoiceRow.classList.remove('invoice-selected');
        selectedInvoiceRow = row;
        selectedInvoiceRow.classList.add('invoice-selected');
        if (!invoiceContextMenu) return;
        invoiceContextMenu.hidden = false;
        const menuWidth = invoiceContextMenu.offsetWidth || 190;
        const menuHeight = invoiceContextMenu.offsetHeight || 220;
        invoiceContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth - 4)}px`;
        invoiceContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight - 4)}px`;
    };

    document.querySelectorAll('.invoice-table tbody tr[data-invoice-code]').forEach((row) => {
        row.addEventListener('contextmenu', (event) => showInvoiceContextMenu(event, row));
        row.addEventListener('dblclick', () => {
            selectedInvoiceRow = row;
            openInvoiceEditDialog();
        });
    });

    // --- HOÀN TÁC THANH TOÁN (UNDO PAYMENT) ---
    const undoPaymentDialog = document.querySelector('#undo-payment-confirm-dialog');
    const undoPaymentMsgEl = document.querySelector('#undo-payment-confirm-msg');
    const undoPaymentYesBtn = document.querySelector('#undo-payment-confirm-yes');
    const undoPaymentNoBtn = document.querySelector('#undo-payment-confirm-no');
    const undoPaymentCloseBtn = document.querySelector('#undo-payment-confirm-close');

    const closeUndoPaymentDialog = () => {
        if (undoPaymentDialog) undoPaymentDialog.hidden = true;
        pendingUndoTarget = null;
        if (undoPaymentYesBtn) {
            undoPaymentYesBtn.disabled = false;
            undoPaymentYesBtn.textContent = 'Có';
        }
    };

    const openUndoPaymentDialog = (targetInfo) => {
        if (!targetInfo || !targetInfo.invoice_code || !undoPaymentDialog) return;
        closeInvoiceContextMenu();
        const invoiceCode = String(targetInfo.invoice_code).replace(/^#/, '');
        let tableName = targetInfo.table_name || '';
        let tableId = targetInfo.table_id ? String(targetInfo.table_id) : '';

        if (!tableName && tableId) {
            const btn = document.querySelector(`.table[data-table-id="${tableId}"]`);
            if (btn) tableName = btn.dataset.tableName || '';
        }
        if (!tableId && tableName) {
            const btn = Array.from(document.querySelectorAll('.table')).find(
                (b) => (b.dataset.tableName || '').toLowerCase() === tableName.toLowerCase()
            );
            if (btn) tableId = String(btn.dataset.tableId);
        }

        pendingUndoTarget = {
            invoice_code: invoiceCode,
            table_id: tableId,
            table_name: tableName || 'Mang về',
        };

        if (undoPaymentMsgEl) {
            undoPaymentMsgEl.textContent = `Hoàn tác thanh toán cho bàn ${pendingUndoTarget.table_name} (Hóa đơn số ${invoiceCode})`;
        }
        if (undoPaymentYesBtn) {
            undoPaymentYesBtn.disabled = false;
            undoPaymentYesBtn.textContent = 'Có';
        }
        undoPaymentDialog.hidden = false;
    };
    window.openUndoPaymentDialog = openUndoPaymentDialog;

    undoPaymentNoBtn?.addEventListener('click', closeUndoPaymentDialog);
    undoPaymentCloseBtn?.addEventListener('click', closeUndoPaymentDialog);

    undoPaymentYesBtn?.addEventListener('click', async () => {
        if (!pendingUndoTarget || !pendingUndoTarget.invoice_code) {
            closeUndoPaymentDialog();
            return;
        }
        const target = { ...pendingUndoTarget };
        const undoUrl = orderColumn?.dataset.undoPaymentUrl || invoiceContextMenu?.dataset.undoUrl || '/sales/invoices/undo/';

        undoPaymentYesBtn.disabled = true;
        undoPaymentYesBtn.textContent = 'Đang xử lý...';

        try {
            const response = await fetch(undoUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({
                    invoice_code: target.invoice_code,
                    table_id: target.table_id || null,
                }),
            });
            const result = await response.json();
            if (!response.ok || !result.ok) {
                showToast(result.error || 'Không thể hoàn tác thanh toán.');
                undoPaymentYesBtn.disabled = false;
                undoPaymentYesBtn.textContent = 'Có';
                return;
            }

            closeUndoPaymentDialog();

            // 1. Xóa dòng hóa đơn vừa hoàn tác khỏi bảng hóa đơn đã thanh toán
            const invRow = document.querySelector(`.invoice-table tbody tr[data-invoice-code="${target.invoice_code}"]`);
            if (invRow) {
                invRow.remove();
            }

            // 2. Khôi phục dữ liệu bàn và danh sách món
            const restored = result.restored_order || {};
            const restoredTableId = String(restored.table_id || target.table_id || '');
            let targetTableBtn = restoredTableId
                ? document.querySelector(`.table[data-table-id="${restoredTableId}"]`)
                : null;
            if (!targetTableBtn && (restored.table_name || target.table_name)) {
                const searchName = (restored.table_name || target.table_name).toLowerCase();
                targetTableBtn = Array.from(document.querySelectorAll('.table')).find(
                    (b) => (b.dataset.tableName || '').toLowerCase() === searchName
                );
            }

            const finalTableId = targetTableBtn ? String(targetTableBtn.dataset.tableId) : restoredTableId;

            if (finalTableId) {
                if (result.previous_last_paid && result.previous_last_paid.invoice_code) {
                    tableLastPaidMap.set(finalTableId, result.previous_last_paid);
                } else {
                    tableLastPaidMap.delete(finalTableId);
                }
            }

            if (targetTableBtn && finalTableId) {
                const restoredCart = new Map();
                (restored.items || []).forEach((item, idx) => {
                    const key = String(item.product_id || `item_${idx}`);
                    const existing = restoredCart.get(key);
                    if (existing) {
                        existing.quantity += Number(item.quantity) || 1;
                    } else {
                        restoredCart.set(key, {
                            product_id: Number(item.product_id),
                            name: item.name,
                            unit: item.unit || 'Phần',
                            price: Number(item.price) || 0,
                            base_price: Number(item.base_price) || Number(item.price) || 0,
                            discount_percent: Number(item.discount_percent) || 0,
                            discount_amount: Number(item.discount_amount) || 0,
                            quantity: Number(item.quantity) || 1,
                            note: item.note || '',
                        });
                    }
                });

                const restoredTableData = {
                    cart: restoredCart,
                    itemsSentToKitchen: true,
                    tableName: targetTableBtn.dataset.tableName,
                    area: targetTableBtn.dataset.area,
                    arrivalTime: restored.arrival_time || getArrivalTime(),
                    combinedWith: null,
                    surchargeAmount: Number(restored.surcharge_amount) || 0,
                    orderDiscountAmount: Number(restored.discount_amount) || 0,
                };
                tableOrders.set(finalTableId, restoredTableData);
                saveTableOrdersToSession();

                // Mở bàn vừa hoàn tác ở trạng thái Đang phục vụ (màu xanh lá, đóng cột menu để thấy rõ cột Hóa đơn & Nhật ký)
                openSelectedTable(targetTableBtn, { unlockMenu: false, skipLog: true });
                showTableSpeechBubble(targetTableBtn, 'Đã hoàn tác việc thanh toán!');
            }

            // 3. Thêm dòng nhật ký hoạt động trực tiếp
            if (result.activity_log) {
                prependActivityLogRow(result.activity_log);
            }
        } catch (err) {
            showToast(err.message || 'Lỗi kết nối khi hoàn tác thanh toán.');
            undoPaymentYesBtn.disabled = false;
            undoPaymentYesBtn.textContent = 'Có';
        }
    });

    if (invoiceContextMenu) {
        invoiceContextMenu.querySelectorAll('button[data-invoice-action]').forEach((actionButton) => {
            actionButton.addEventListener('click', () => {
                const action = actionButton.dataset.invoiceAction;
                if (action === 'edit') {
                    openInvoiceEditDialog();
                } else if (action === 'delete') {
                    openInvoiceDeleteDialog();
                } else if (action === 'change') {
                    openInvoiceChangeDialog();
                } else if (action === 'undo_payment') {
                    const row = selectedInvoiceRow;
                    if (!row) return;
                    const code = getRowInvoiceCode(row);
                    const tId = row.dataset.tableId || '';
                    const tName = row.dataset.tableName || row.children[2]?.textContent?.trim() || '';
                    openUndoPaymentDialog({
                        invoice_code: code,
                        table_id: tId,
                        table_name: tName,
                    });
                } else if (action === 'print') {
                    closeInvoiceContextMenu();
                    const doPrint = () => showToast(invoiceActionMessages.print || 'Đang in lại hóa đơn.');
                    if (typeof window.requirePosPermission === 'function') {
                        window.requirePosPermission('reprint_invoice', doPrint, 'In lại hóa đơn');
                    } else {
                        doPrint();
                    }
                } else if (!actionButton.disabled) {
                    showToast(invoiceActionMessages[action] || 'Đã thực hiện thao tác.');
                    closeInvoiceContextMenu();
                }
            });
        });
    }

    document.querySelector('#invoice-delete-close')?.addEventListener('click', closeInvoiceDeleteDialog);
    document.querySelector('#invoice-delete-cancel')?.addEventListener('click', closeInvoiceDeleteDialog);
    invoiceDeleteConfirm?.addEventListener('click', async () => {
        const reason = invoiceDeleteReason?.value.trim() || '';
        if (!reason) return;
        const row = targetInvoiceRowForAction || selectedInvoiceRow;
        const invoiceCode = getRowInvoiceCode(row);
        if (!invoiceCode || !invoiceContextMenu) return;

        invoiceDeleteConfirm.disabled = true;
        invoiceDeleteConfirm.textContent = 'Đang xử lý...';
        try {
            const response = await fetch(invoiceContextMenu.dataset.deleteUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken(),
                },
                body: JSON.stringify({ invoice_code: invoiceCode, reason }),
            });
            const result = await response.json();
            if (!response.ok) {
                showToast(result.error || 'Không thể xóa hóa đơn.');
                invoiceDeleteConfirm.disabled = false;
                invoiceDeleteConfirm.textContent = 'Xác nhận';
                return;
            }
            if (result.activity_log) {
                prependActivityLogRow(result.activity_log);
            }
            if (row) {
                row.remove();
            }
            closeInvoiceDeleteDialog();
            showToast(result.message || `Đã xóa hóa đơn #${invoiceCode}.`);
        } catch (err) {
            showToast(err.message || 'Lỗi kết nối khi xóa hóa đơn.');
            invoiceDeleteConfirm.disabled = false;
            invoiceDeleteConfirm.textContent = 'Xác nhận';
        }
    });

    document.addEventListener('click', (event) => {
        if (invoiceContextMenu && !invoiceContextMenu.contains(event.target) && !event.target.closest('.invoice-table')) {
            closeInvoiceContextMenu();
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeInvoiceContextMenu();
            closeInvoiceDeleteDialog();
            closeInvoiceChangeDialog();
            closeUndoPaymentDialog();
            closeTableConfirmDialog();
            closeTableSplitDialog();
            closePasswordDialog();
            cancelActiveTableTool();
        }
    });

    const managementMessages = {
        customers: 'Chức năng quản lý khách hàng sẽ được mở khi mô-đun thành viên được cấu hình.',
        cashbook: 'Sổ thu chi chưa có dữ liệu giao dịch để hiển thị.',
        debt: 'Chức năng công nợ cần được cấu hình cùng thông tin khách hàng và nhà cung cấp.',
    };
    document.querySelectorAll('.management-action').forEach((actionButton) => {
        actionButton.addEventListener('click', () => {
            const menu = actionButton.closest('.pos-menu-item');
            menu.classList.remove('open');
            menu.querySelector(':scope > button').setAttribute('aria-expanded', 'false');
            showToast(managementMessages[actionButton.dataset.management]);
        });
    });

    const reportMessages = {
        'customer-revenue': 'Báo cáo doanh thu theo khách hàng cần dữ liệu thành viên để tổng hợp.',
        purchases: 'Chưa có dữ liệu hoạt động mua hàng để lập báo cáo.',
        cash: 'Thống kê các khoản tiền cần được cấu hình cùng sổ thu chi.',
        'guest-count': 'Lượng khách hôm nay sẽ được tổng hợp khi đơn hàng có thông tin khách hàng.',
    };
    document.querySelectorAll('.report-action').forEach((actionButton) => {
        actionButton.addEventListener('click', () => {
            const menu = actionButton.closest('.pos-menu-item');
            if (menu) {
                menu.classList.remove('open');
                menu.querySelector(':scope > button')?.setAttribute('aria-expanded', 'false');
            }
            if (actionButton.dataset.report === 'guest-count') {
                if (typeof window.openGuestCountTodayModal === 'function') {
                    window.openGuestCountTodayModal();
                }
                return;
            }
            showToast(reportMessages[actionButton.dataset.report]);
        });
    });

    const formatMoney = (amount) => `${amount.toLocaleString('vi-VN')} đ`;

    const openEditItemDialog = (productId, item) => {
        if (!selectedTableId) return;
        editingCartItemId = String(productId);
        const matchingDish = Array.from(document.querySelectorAll('.dish')).find(
            (d) => d.dataset.productId === String(productId)
        );
        dialogProduct = matchingDish || {
            dataset: {
                productId: String(productId),
                dish: item.name,
                unit: item.unit,
                price: item.price
            }
        };
        document.querySelector('#dialog-title').textContent = `Bàn ${selectedTable.textContent} - Chỉnh sửa món`;
        document.querySelector('#dialog-product-name').textContent = item.name;
        dialogQuantity.value = item.quantity;
        dialogPrice.value = Number(item.price).toLocaleString('vi-VN');
        if (typeof window.posHasPermission === 'function') {
            dialogPrice.readOnly = !window.posHasPermission('edit_item_price');
        }
        if (dialogDiscount) {
            dialogDiscount.value = String(item.discount_percent || 0);
        }
        document.querySelector('#dialog-note').value = item.note || '';
        dialog.hidden = false;
    };

    const renderCart = () => {
        orderItems.innerHTML = '';
        cart.forEach((item, productId) => {
            const netItemTotal = getItemNetTotal(item);
            const discountPct = Number(item.discount_percent) || 0;
            const discountBadgeHtml = discountPct > 0
                ? ` <span class="order-item-discount-tag">(-${discountPct}%)</span>`
                : '';
            const row = document.createElement('div');
            row.className = 'order-item new-item';
            row.dataset.productId = productId;
            row.innerHTML = `
                <div class="order-item-header">
                    <span class="order-item-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                    <span class="order-item-price-total">${formatMoney(netItemTotal)}</span>
                </div>
                <div class="order-item-meta-row">
                    <span class="order-item-unit-price" title="Bấm để sửa món / ghi chú">${formatMoney(item.price)} / ${escapeHtml(item.unit)}${discountBadgeHtml}</span>
                    <div class="order-qty-pill">
                        <button type="button" class="btn-qty-minus" data-id="${productId}" title="Giảm số lượng">-</button>
                        <span class="order-qty-val">${item.quantity}</span>
                        <button type="button" class="btn-qty-plus" data-id="${productId}" title="Tăng số lượng">+</button>
                        <button type="button" class="btn-remove-item" data-id="${productId}" title="Bỏ món này">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                ${item.note ? `
                    <div class="order-item-note" title="Bấm để sửa ghi chú">
                        <span class="note-bullet">📝</span>
                        <span class="note-content">${escapeHtml(item.note)}</span>
                    </div>
                ` : ''}
            `;
            orderItems.appendChild(row);

            // Row click to edit note/quantity
            row.querySelector('.order-item-header').addEventListener('click', () => {
                openEditItemDialog(productId, item);
            });
            row.querySelector('.order-item-unit-price').addEventListener('click', () => {
                openEditItemDialog(productId, item);
            });
            const noteEl = row.querySelector('.order-item-note');
            if (noteEl) {
                noteEl.addEventListener('click', () => {
                    openEditItemDialog(productId, item);
                });
            }
        });

        // Event listeners for remove and qty change
        orderItems.querySelectorAll('.btn-remove-item').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const doRemove = () => {
                    const removedItem = cart.get(id);
                    if (itemsSentToKitchen && removedItem && selectedTableId) {
                        const tName = selectedTable?.textContent || '';
                        postTableAction({
                            action: 'cancel_item',
                            source_table_id: selectedTableId,
                            detail: `Bàn ${tName} hủy món ${removedItem.name} (đã nhận+xong ${removedItem.quantity} phần)`,
                        });
                    }
                    cart.delete(id);
                    const tableData = tableOrders.get(selectedTableId);
                    if (tableData) tableData.cart = cart;
                    saveTableOrdersToSession();
                    renderCart();
                };
                if (itemsSentToKitchen && typeof window.requirePosPermission === 'function') {
                    window.requirePosPermission('cancel_received_item', doRemove, 'Hủy món đã nhận');
                } else {
                    doRemove();
                }
            });
        });

        orderItems.querySelectorAll('.btn-qty-minus').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const item = cart.get(id);
                if (!item) return;
                const doDecrease = () => {
                    if (itemsSentToKitchen && selectedTableId) {
                        const tName = selectedTable?.textContent || '';
                        postTableAction({
                            action: 'cancel_item',
                            source_table_id: selectedTableId,
                            detail: `Bàn ${tName} hủy món ${item.name} (đã nhận+xong 1 phần)`,
                        });
                    }
                    if (item.quantity > 1) {
                        item.quantity -= 1;
                    } else {
                        cart.delete(id);
                    }
                    const tableData = tableOrders.get(selectedTableId);
                    if (tableData) tableData.cart = cart;
                    saveTableOrdersToSession();
                    renderCart();
                };
                if (itemsSentToKitchen && typeof window.requirePosPermission === 'function') {
                    window.requirePosPermission('cancel_received_item', doDecrease, 'Hủy món đã nhận');
                } else {
                    doDecrease();
                }
            });
        });

        orderItems.querySelectorAll('.btn-qty-plus').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const item = cart.get(id);
                if (item) {
                    item.quantity += 1;
                    const tableData = tableOrders.get(selectedTableId);
                    if (tableData) tableData.cart = cart;
                    saveTableOrdersToSession();
                    renderCart();
                }
            });
        });

        if (!cart.size) {
            orderItems.innerHTML = selectedTableId ? '<p class="empty-order">Bàn chưa có món nào. Chọn món bên phải để gọi.</p>' : '<p class="empty-order">Chọn bàn để bắt đầu.</p>';
        }
        const summary = getCartSummary();
        if (subtotalElement) subtotalElement.textContent = formatMoney(summary.subtotal);
        if (surchargeElement) surchargeElement.textContent = formatMoney(summary.surcharge);
        if (discountElement) discountElement.textContent = summary.totalDiscount > 0 ? `-${formatMoney(summary.totalDiscount)}` : '0 đ';
        if (totalElement) totalElement.textContent = formatMoney(summary.total);
        renderOpenAction();
    };

    document.querySelectorAll('.table').forEach((tableButton) => {
        tableButton.addEventListener('click', () => {
            const clickedId = String(tableButton.dataset.tableId);

            // Nếu đang trong chế độ Chuyển / Nhập / Ghép / Tách bàn và người dùng nhấn vào bàn đích
            if (activeTableTool && selectedTableId) {
                if (clickedId === String(selectedTableId)) {
                    showToast('Vui lòng chọn một bàn khác với bàn hiện tại.');
                    return;
                }
                if (activeTableTool === 'split') {
                    openTableSplitModal(tableButton);
                } else {
                    openTableConfirmModal(activeTableTool, tableButton);
                }
                return;
            }

            // Nếu bàn đã được mở trước đó (đang gọi món / đang phục vụ), chuyển thẳng vào bàn đó
            if (tableOrders.has(clickedId)) {
                const tData = tableOrders.get(clickedId);
                openSelectedTable(tableButton, { unlockMenu: !tData?.itemsSentToKitchen });
                return;
            }

            // Nếu bàn đang ở trạng thái preview và nhấn lần 2 vào chính bàn đó -> Mở bàn luôn
            if (previewedTable === tableButton && !selectedTableId && tablePreviewArmed) {
                openSelectedTable(tableButton);
                return;
            }

            // Lần 1 nhấn vào bàn trống / bàn đã đặt: hiển thị thông tin bàn (Mở bàn, Gọi món, Đặt chỗ / Hủy đặt)
            showTablePreview(tableButton);
            tablePreviewArmed = true;
        });
    });

    document.querySelector('#open-menu')?.addEventListener('click', () => {
        if (!selectedTableId && previewedTable) {
            openSelectedTable(previewedTable);
        }
        if (selectedTableId) setMenuUnlocked(true);
    });
    document.querySelector('#collapse-order-menu')?.addEventListener('click', () => setMenuUnlocked(false));
    selectionPrimaryAction?.addEventListener('click', () => {
        if (!selectedTableId && previewedTable) {
            openSelectedTable(previewedTable);
            return;
        }
        clearSelectedTable();
    });
    orderPrimaryAction?.addEventListener('click', () => {
        if (!cart.size) {
            clearSelectedTable();
            return;
        }
        if (!itemsSentToKitchen) {
            // Thêm món xong hết: Bàn chuyển sang MÀU XANH và nút chuyển thành Thanh toán
            itemsSentToKitchen = true;
            if (typeof window.recordPosKitchenReception === 'function') {
                window.recordPosKitchenReception();
            }
            const tableData = tableOrders.get(selectedTableId);
            if (tableData) {
                tableData.itemsSentToKitchen = true;
            }
            saveTableOrdersToSession();
            const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
            if (activeTable) {
                activeTable.classList.remove('table-opening', 'table-red');
                activeTable.classList.add('kitchen-sent', 'table-green', 'occupied');
                updateTableLastPaidBadge(activeTable);
            }
            orderStatus.textContent = 'Đang phục vụ món';
            orderStatus.classList.add('pending');
            renderOpenAction();
            return;
        }
        openPaymentDialog();
    });

    // Helper to normalize Vietnamese text for search
    const removeVietnameseTones = (str) => {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    };

    const dishSearchInput = document.querySelector('#pos-dish-search');
    const dishSearchClearBtn = document.querySelector('#pos-dish-clear-search');
    const subgroupChipsBar = document.querySelector('#subgroup-chips-bar');
    const subgroupChipsList = document.querySelector('#subgroup-chips-list');
    const dishGrid = document.querySelector('#dish-grid');

    // Generate / update subgroup divider banners in #dish-grid
    const ensureSubgroupDividers = () => {
        if (!dishGrid) return;
        const dishes = Array.from(dishGrid.querySelectorAll('.dish'));
        const existingDividers = new Map();
        dishGrid.querySelectorAll('.subgroup-divider').forEach((div) => {
            existingDividers.set(`${div.dataset.categoryId}__${div.dataset.subgroup}`, div);
        });

        // Group dishes by category and subgroup
        const catSubMap = new Map();
        dishes.forEach((dish) => {
            const catId = dish.dataset.categoryId;
            const sub = (dish.dataset.subgroup || '').trim();
            if (!sub) return;
            const key = `${catId}__${sub}`;
            if (!catSubMap.has(key)) {
                catSubMap.set(key, dish);
            }
        });

        catSubMap.forEach((firstDish, key) => {
            const [catId, sub] = key.split('__');
            let divider = existingDividers.get(key);
            if (!divider) {
                divider = document.createElement('div');
                divider.className = 'subgroup-divider';
                divider.dataset.categoryId = catId;
                divider.dataset.subgroup = sub;
                divider.innerHTML = `
                    <span class="subgroup-divider-title">${sub}</span>
                    <span class="subgroup-divider-line"></span>
                `;
            }
            if (divider.nextElementSibling !== firstDish) {
                dishGrid.insertBefore(divider, firstDish);
            }
        });
    };

    // Update Subgroup filter chips based on current active category
    const renderSubgroupChips = (activeCatId) => {
        if (!subgroupChipsBar || !subgroupChipsList) return;
        const dishes = Array.from(dishGrid.querySelectorAll(`.dish[data-category-id="${activeCatId}"]`));
        const subgroups = new Set();
        dishes.forEach((d) => {
            const sub = (d.dataset.subgroup || '').trim();
            if (sub) subgroups.add(sub);
        });

        if (subgroups.size === 0) {
            subgroupChipsBar.hidden = true;
            subgroupChipsList.innerHTML = '';
            return;
        }

        subgroupChipsBar.hidden = false;
        let html = `<button type="button" class="subgroup-chip active" data-subgroup="all">Tất cả</button>`;
        subgroups.forEach((sub) => {
            html += `<button type="button" class="subgroup-chip" data-subgroup="${sub}">${sub}</button>`;
        });
        subgroupChipsList.innerHTML = html;

        subgroupChipsList.querySelectorAll('.subgroup-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                subgroupChipsList.querySelectorAll('.subgroup-chip').forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                updateMenuFiltering();
            });
        });
    };

    // Main filtering function
    const updateMenuFiltering = () => {
        if (!dishGrid) return;
        ensureSubgroupDividers();

        const activeCategory = document.querySelector('.category.active');
        const activeCatId = activeCategory ? activeCategory.dataset.categoryId : null;
        const rawQuery = dishSearchInput ? dishSearchInput.value.trim() : '';
        const searchNormalized = removeVietnameseTones(rawQuery);
        const isSearching = searchNormalized.length > 0;

        if (dishSearchClearBtn) dishSearchClearBtn.hidden = !isSearching;

        const activeChip = subgroupChipsList ? subgroupChipsList.querySelector('.subgroup-chip.active') : null;
        const selectedSubgroup = activeChip ? activeChip.dataset.subgroup : 'all';

        const dishes = Array.from(dishGrid.querySelectorAll('.dish'));
        let visibleCount = 0;
        const visibleSubgroups = new Set();

        dishes.forEach((dish) => {
            const catId = dish.dataset.categoryId;
            const dishName = dish.dataset.dish || '';
            const dishCode = dish.dataset.code || '';
            const dishSub = (dish.dataset.subgroup || '').trim();

            let matchSearch = true;
            if (isSearching) {
                const nameNorm = removeVietnameseTones(dishName);
                const codeNorm = removeVietnameseTones(dishCode);
                matchSearch = nameNorm.includes(searchNormalized) || codeNorm.includes(searchNormalized);
            }

            let matchCat = true;
            if (!isSearching) {
                matchCat = catId === activeCatId;
            }

            let matchSub = true;
            if (!isSearching && selectedSubgroup !== 'all') {
                matchSub = dishSub === selectedSubgroup;
            }

            const visible = matchSearch && matchCat && matchSub;
            dish.hidden = !visible;

            if (visible) {
                visibleCount++;
                if (dishSub) visibleSubgroups.add(`${catId}__${dishSub}`);
            }
        });

        // Toggle dividers
        dishGrid.querySelectorAll('.subgroup-divider').forEach((div) => {
            const key = `${div.dataset.categoryId}__${div.dataset.subgroup}`;
            let showDivider = false;
            if (isSearching) {
                showDivider = visibleSubgroups.has(key);
            } else {
                showDivider = (div.dataset.categoryId === activeCatId) &&
                              (selectedSubgroup === 'all' || selectedSubgroup === div.dataset.subgroup) &&
                              visibleSubgroups.has(key);
            }
            div.hidden = !showDivider;
        });

        // Update menu title
        if (menuTitle) {
            if (isSearching) {
                menuTitle.textContent = `TÌM KIẾM: "${rawQuery}" (${visibleCount})`;
            } else if (activeCategory) {
                menuTitle.textContent = activeCategory.dataset.category ? activeCategory.dataset.category.toUpperCase() : 'DANH MỤC MÓN';
            }
        }
    };

    window.refreshPosMenuFilter = () => {
        const activeCategory = document.querySelector('.category.active');
        if (activeCategory) {
            renderSubgroupChips(activeCategory.dataset.categoryId);
        }
        updateMenuFiltering();
    };

    document.querySelectorAll('.category').forEach((categoryButton) => {
        categoryButton.addEventListener('click', () => {
            document.querySelectorAll('.category').forEach((button) => button.classList.remove('active'));
            categoryButton.classList.add('active');
            if (dishSearchInput) dishSearchInput.value = '';
            renderSubgroupChips(categoryButton.dataset.categoryId);
            updateMenuFiltering();
        });
    });

    if (dishSearchInput) {
        dishSearchInput.addEventListener('input', updateMenuFiltering);
        dishSearchInput.addEventListener('keyup', updateMenuFiltering);
        dishSearchInput.addEventListener('change', updateMenuFiltering);
        dishSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dishSearchInput.value = '';
                updateMenuFiltering();
            }
        });
    }

    if (dishSearchClearBtn) {
        dishSearchClearBtn.addEventListener('click', () => {
            if (dishSearchInput) dishSearchInput.value = '';
            dishSearchInput?.focus();
            updateMenuFiltering();
        });
    }

    const firstCategory = document.querySelector('.category.active');
    if (firstCategory) {
        renderSubgroupChips(firstCategory.dataset.categoryId);
        updateMenuFiltering();
    }

    dialogPrice?.addEventListener('click', () => {
        if (!dialogPrice.readOnly) return;
        if (typeof window.posGetExtraOption === 'function' && window.posGetExtraOption('lock_edit_price_all_roles')) {
            showToast('Hệ thống đang khóa chức năng sửa giá món đối với mọi cấp bậc người dùng.');
            return;
        }
        if (typeof window.requirePosPermission === 'function') {
            window.requirePosPermission('edit_item_price', () => {
                dialogPrice.readOnly = false;
                dialogPrice.focus();
                dialogPrice.select();
            }, 'Sửa giá món');
        }
    });

    document.querySelectorAll('.dish').forEach((dishButton) => {
        dishButton.addEventListener('click', () => {
            if (!menuUnlocked || !selectedTableId) return;
            dialogProduct = dishButton;
            editingCartItemId = null;
            document.querySelector('#dialog-title').textContent = `Bàn ${selectedTable.textContent} - Yêu cầu món mới`;
            document.querySelector('#dialog-product-name').textContent = dishButton.dataset.dish;
            dialogQuantity.value = '1';
            dialogPrice.value = Number(dishButton.dataset.price).toLocaleString('vi-VN');
            if (typeof window.posHasPermission === 'function') {
                dialogPrice.readOnly = !window.posHasPermission('edit_item_price');
            }
            if (dialogDiscount) {
                dialogDiscount.value = '0';
            }
            document.querySelector('#dialog-note').value = '';
            dialog.hidden = false;
        });
    });

    document.querySelector('#quantity-minus').addEventListener('click', () => {
        dialogQuantity.value = Math.max(1, Number(dialogQuantity.value || 1) - 1);
    });
    document.querySelector('#quantity-plus').addEventListener('click', () => {
        dialogQuantity.value = Math.min(999, Number(dialogQuantity.value || 1) + 1);
    });
    document.querySelectorAll('.quick-notes button').forEach((button) => {
        button.addEventListener('click', () => {
            const note = document.querySelector('#dialog-note');
            note.value = note.value ? `${note.value}, ${button.textContent}` : button.textContent;
        });
    });
    document.querySelector('#dialog-confirm').addEventListener('click', () => {
        if (!dialogProduct) return;
        const productId = String(dialogProduct.dataset.productId);
        const existing = cart.get(productId);
        const quantity = Number(dialogQuantity.value) || 1;
        const note = (document.querySelector('#dialog-note').value || '').trim();
        const customPrice = parseMoneyText(dialogPrice?.value) || Number(dialogProduct.dataset.price);
        const discountPct = Math.min(100, Math.max(0, Number(dialogDiscount?.value) || 0));

        if (editingCartItemId === productId) {
            cart.set(productId, {
                product_id: Number(productId),
                name: dialogProduct.dataset.dish,
                unit: dialogProduct.dataset.unit,
                price: customPrice,
                discount_percent: discountPct,
                quantity: quantity,
                note: note,
            });
        } else {
            cart.set(productId, {
                product_id: Number(productId),
                name: dialogProduct.dataset.dish,
                unit: dialogProduct.dataset.unit,
                price: customPrice,
                discount_percent: discountPct || (existing ? existing.discount_percent || 0 : 0),
                quantity: existing ? existing.quantity + quantity : quantity,
                note: note || (existing ? existing.note : ''),
            });
        }
        const tableData = tableOrders.get(selectedTableId);
        if (tableData) {
            tableData.cart = cart;
        }
        saveTableOrdersToSession();
        editingCartItemId = null;
        renderCart();
        closeDialog();
    });
    document.querySelector('#dialog-cancel').addEventListener('click', closeDialog);
    document.querySelector('#dialog-close').addEventListener('click', closeDialog);

    document.querySelectorAll('.record-tab').forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
            document.querySelectorAll('.record-tab').forEach((button) => button.classList.remove('active'));
            tabButton.classList.add('active');
        });
    });

    // Khôi phục các bàn đang mở / vừa hoàn tác từ sessionStorage và hiển thị thời điểm phục vụ gần nhất
    loadTableOrdersFromSession();
    tableOrders.forEach((tData, tId) => {
        const btn = document.querySelector(`.table[data-table-id="${tId}"]`);
        if (btn) {
            applyTableVisualState(btn, tData);
        }
    });
    updateAllTableLastPaidBadges();

    setMenuUnlocked(false);
    renderCart();
    const firstTakeawayTable = Array.from(document.querySelectorAll('.table')).find((button) =>
        button.dataset.area.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'mang ve'
    );
    if (firstTakeawayTable) {
        const tId = String(firstTakeawayTable.dataset.tableId);
        if (tableOrders.has(tId)) {
            openSelectedTable(firstTakeawayTable, { unlockMenu: false, skipLog: true });
        } else {
            showTablePreview(firstTakeawayTable);
            tablePreviewArmed = false;
        }
    }
});
