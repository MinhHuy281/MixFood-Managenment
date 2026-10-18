document.addEventListener('DOMContentLoaded', () => {
    const selectedTable = document.querySelector('#selected-table');
    const orderItems = document.querySelector('#order-items');
    const menuTitle = document.querySelector('#menu-title');
    const subtotalElement = document.querySelector('#order-subtotal');
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

    const dialog = document.querySelector('#order-dialog');
    const menuColumn = document.querySelector('.menu-column');
    const posLayout = document.querySelector('.pos-layout');
    const dialogQuantity = document.querySelector('#dialog-quantity');
    const dialogPrice = document.querySelector('#dialog-price');
    const paymentDialog = document.querySelector('#payment-dialog');
    const paymentTotal = document.querySelector('#payment-total');
    const paymentMethodDialog = document.querySelector('#payment-method-dialog');
    const customerPaid = document.querySelector('#customer-paid');
    const changeAmount = document.querySelector('#change-amount');
    const paymentConfirm = document.querySelector('#payment-confirm');

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
            orderItems.innerHTML = `<p class="empty-order">${isReserved ? 'Bàn đã được đặt trước. Nhấn Mở bàn hoặc Gọi món khi khách vào.' : 'Bàn đang trống. Nhấn Mở bàn, Gọi món hoặc Đặt chỗ.'}</p>`;
        }
        if (subtotalElement) subtotalElement.textContent = '0 đ';
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
        }
        if (activeTable) {
            activeTable.classList.remove('selected', 'preview', 'table-opening', 'table-red', 'kitchen-sent', 'table-green', 'occupied', 'reserved');
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
            return;
        }
        if (tableData.itemsSentToKitchen) {
            tableButton.classList.remove('table-opening', 'table-red');
            tableButton.classList.add('kitchen-sent', 'table-green', 'occupied');
        } else {
            tableButton.classList.add('table-opening', 'table-red', 'occupied');
            tableButton.classList.remove('kitchen-sent', 'table-green');
        }
    };

    const openSelectedTable = (tableButton) => {
        if (!tableButton) return;
        cancelActiveTableTool();
        selectedTableId = tableButton.dataset.tableId;
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
            };
            tableOrders.set(selectedTableId, tableData);
        }

        cart = tableData.cart;
        itemsSentToKitchen = tableData.itemsSentToKitchen;

        applyTableVisualState(tableButton, tableData);
        if (isNewlyOpened) {
            postTableAction({ action: 'open', source_table_id: selectedTableId });
        }

        showSelectedTable(tableButton);
        if (selectionPrimaryAction) selectionPrimaryAction.textContent = 'Hủy bàn';
        setSecondaryActions(false, tableButton);
        setMenuUnlocked(true);
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
            applyTableVisualState(sourceButton, null);
            openSelectedTable(targetButton);
        } else {
            const sourceData = tableOrders.get(sourceId);
            if (sourceData) sourceData.cart = cart;
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

    const getCartTotal = () => Array.from(cart.values()).reduce((total, item) => total + (item.price * item.quantity), 0);
    const updateChangeAmount = () => {
        const total = getCartTotal();
        const paid = Number(customerPaid.value) || 0;
        const change = Math.max(paid - total, 0);
        changeAmount.value = formatMoney(change);
        paymentConfirm.disabled = paid < total;
    };
    const openPaymentDialog = () => {
        const total = getCartTotal();
        paymentDialog.querySelector('#payment-dialog-title').textContent = `Bàn ${selectedTable.textContent} - Thanh toán`;
        paymentTotal.textContent = formatMoney(total);
        customerPaid.value = total;
        updateChangeAmount();
        paymentDialog.hidden = false;
        customerPaid.focus();
        customerPaid.select();
    };
    const closePaymentDialog = () => { paymentDialog.hidden = true; };
    customerPaid.addEventListener('input', updateChangeAmount);
    document.querySelector('#payment-dialog-close').addEventListener('click', closePaymentDialog);
    document.querySelector('#payment-cancel').addEventListener('click', closePaymentDialog);
    paymentConfirm.addEventListener('click', async () => {
        const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
        paymentConfirm.disabled = true;
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(paymentDialog.dataset.checkoutUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify({
                    items: Array.from(cart.values()).map((item) => ({ product_id: item.product_id, quantity: item.quantity })),
                    payment_method: paymentMethodDialog.value,
                    table_id: selectedTableId,
                    order_type: 'dine_in',
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Không thể hoàn tất thanh toán.');
            if (activeTable) {
                activeTable.classList.remove('selected', 'preview', 'table-opening', 'table-red', 'kitchen-sent', 'table-green', 'occupied');
            }
            if (selectedTableId) {
                tableOrders.delete(selectedTableId);
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
    const passwordChangeForm = document.querySelector('#password-change-form');
    const passwordConfirmButton = document.querySelector('#password-confirm-button');
    const passwordInputs = Array.from(passwordChangeForm.querySelectorAll('input[type="password"]'));
    const closePasswordDialog = () => {
        passwordDialog.hidden = true;
        passwordDialogBackdrop.hidden = true;
        passwordChangeForm.reset();
        passwordConfirmButton.disabled = true;
    };
    const updatePasswordButton = () => {
        const [oldPassword, newPassword, confirmation] = passwordInputs.map((input) => input.value);
        passwordConfirmButton.disabled = !oldPassword || !newPassword || newPassword !== confirmation;
    };
    document.querySelector('.password-change-action').addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelector('.system-menu').classList.remove('open');
        document.querySelector('.system-menu > button').setAttribute('aria-expanded', 'false');
        passwordDialog.hidden = false;
        passwordDialogBackdrop.hidden = false;
        passwordInputs[0].focus();
    });
    passwordInputs.forEach((input) => input.addEventListener('input', updatePasswordButton));
    document.querySelector('#password-cancel-button').addEventListener('click', closePasswordDialog);
    passwordDialogBackdrop.addEventListener('click', closePasswordDialog);
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
        if (code && typeof window.openInvoiceEditor === 'function') {
            window.openInvoiceEditor(code);
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
        closeInvoiceContextMenu();
        invoiceDeleteDialog.hidden = false;
        window.setTimeout(() => invoiceDeleteReason?.focus(), 40);
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
            closeTableConfirmDialog();
            closeTableSplitDialog();
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
            menu.classList.remove('open');
            menu.querySelector(':scope > button').setAttribute('aria-expanded', 'false');
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
        document.querySelector('#dialog-note').value = item.note || '';
        dialog.hidden = false;
    };

    const renderCart = () => {
        orderItems.innerHTML = '';
        let subtotal = 0;
        cart.forEach((item, productId) => {
            subtotal += item.price * item.quantity;
            const row = document.createElement('div');
            row.className = 'order-item new-item';
            row.dataset.productId = productId;
            row.innerHTML = `
                <div class="order-item-header">
                    <span class="order-item-title" title="${item.name}">${item.name}</span>
                    <span class="order-item-price-total">${formatMoney(item.price * item.quantity)}</span>
                </div>
                <div class="order-item-meta-row">
                    <span class="order-item-unit-price" title="Bấm để sửa món / ghi chú">${formatMoney(item.price)} / ${item.unit}</span>
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
                        <span class="note-content">${item.note}</span>
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
                cart.delete(id);
                const tableData = tableOrders.get(selectedTableId);
                if (tableData) tableData.cart = cart;
                renderCart();
            });
        });

        orderItems.querySelectorAll('.btn-qty-minus').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const item = cart.get(id);
                if (item) {
                    if (item.quantity > 1) {
                        item.quantity -= 1;
                    } else {
                        cart.delete(id);
                    }
                    const tableData = tableOrders.get(selectedTableId);
                    if (tableData) tableData.cart = cart;
                    renderCart();
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
                    renderCart();
                }
            });
        });

        if (!cart.size) {
            orderItems.innerHTML = selectedTableId ? '<p class="empty-order">Bàn chưa có món nào. Chọn món bên phải để gọi.</p>' : '<p class="empty-order">Chọn bàn để bắt đầu.</p>';
        }
        subtotalElement.textContent = formatMoney(subtotal);
        totalElement.textContent = formatMoney(subtotal);
        renderOpenAction();
    };

    document.querySelectorAll('.table').forEach((tableButton) => {
        tableButton.addEventListener('click', () => {
            const clickedId = tableButton.dataset.tableId;

            // Nếu đang trong chế độ Chuyển / Nhập / Ghép / Tách bàn và người dùng nhấn vào bàn đích
            if (activeTableTool && selectedTableId) {
                if (clickedId === selectedTableId) {
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
                openSelectedTable(tableButton);
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
            const tableData = tableOrders.get(selectedTableId);
            if (tableData) {
                tableData.itemsSentToKitchen = true;
            }
            const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
            if (activeTable) {
                activeTable.classList.remove('table-opening', 'table-red');
                activeTable.classList.add('kitchen-sent', 'table-green', 'occupied');
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

    document.querySelectorAll('.dish').forEach((dishButton) => {
        dishButton.addEventListener('click', () => {
            if (!menuUnlocked || !selectedTableId) return;
            dialogProduct = dishButton;
            editingCartItemId = null;
            document.querySelector('#dialog-title').textContent = `Bàn ${selectedTable.textContent} - Yêu cầu món mới`;
            document.querySelector('#dialog-product-name').textContent = dishButton.dataset.dish;
            dialogQuantity.value = '1';
            dialogPrice.value = Number(dishButton.dataset.price).toLocaleString('vi-VN');
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

        if (editingCartItemId === productId) {
            cart.set(productId, {
                product_id: Number(productId),
                name: dialogProduct.dataset.dish,
                unit: dialogProduct.dataset.unit,
                price: Number(dialogProduct.dataset.price),
                quantity: quantity,
                note: note,
            });
        } else {
            cart.set(productId, {
                product_id: Number(productId),
                name: dialogProduct.dataset.dish,
                unit: dialogProduct.dataset.unit,
                price: Number(dialogProduct.dataset.price),
                quantity: existing ? existing.quantity + quantity : quantity,
                note: note || (existing ? existing.note : ''),
            });
        }
        const tableData = tableOrders.get(selectedTableId);
        if (tableData) {
            tableData.cart = cart;
        }
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

    setMenuUnlocked(false);
    renderCart();
    const firstTakeawayTable = Array.from(document.querySelectorAll('.table')).find((button) =>
        button.dataset.area.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'mang ve'
    );
    if (firstTakeawayTable) {
        showTablePreview(firstTakeawayTable);
        tablePreviewArmed = false;
    }
});
