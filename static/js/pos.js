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
    const secondaryActions = Array.from(document.querySelectorAll('.order-actions button'));
    const cart = new Map();
    let selectedTableId = null;
    let dialogProduct = null;
    let menuUnlocked = false;
    let itemsSentToKitchen = false;
    let previewedTable = null;
    let tablePreviewArmed = false;

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

    const setMenuUnlocked = (unlocked) => {
        menuUnlocked = unlocked;
        menuColumn.hidden = !unlocked;
        posLayout.classList.toggle('menu-visible', unlocked);
        menuColumn.classList.toggle('menu-locked', !unlocked);
        selectionActions.hidden = !selectedTableId || unlocked;
        orderOpenActions.hidden = !unlocked;
        if (selectedTableId) orderMode.textContent = unlocked ? 'Đang gọi món' : 'Chưa gọi món';
    };

    const renderOpenAction = () => {
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

    const setSecondaryActions = (isPreview) => {
        const labels = isPreview ? ['Đặt chỗ', '', '', ''] : ['Chuyển', 'Nhập', 'Ghép', 'Tách'];
        secondaryActions.forEach((button, index) => { button.textContent = labels[index]; });
    };

    const showTablePreview = (tableButton) => {
        previewedTable = tableButton;
        document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected', 'preview'));
        tableButton.classList.add('preview');
        orderTitle.textContent = `Bàn ${tableButton.dataset.tableName} - ${tableButton.dataset.area}`;
        selectedTable.textContent = tableButton.dataset.tableName;
        orderTime.textContent = getArrivalTime();
        orderStatus.textContent = 'Trống';
        orderStatus.classList.remove('pending');
        orderCustomer.textContent = '-';
        orderRequestedBy.textContent = orderColumn.dataset.currentUser;
        orderMode.textContent = '';
        orderItems.innerHTML = '';
        selectionPrimaryAction.textContent = 'Mở bàn';
        selectionActions.hidden = false;
        setSecondaryActions(true);
    };

    const showSelectedTable = (tableButton) => {
        const tableName = tableButton.dataset.tableName;
        orderTitle.textContent = `Bàn ${tableName} - ${tableButton.dataset.area}`;
        selectedTable.textContent = tableName;
        orderTime.textContent = getArrivalTime();
        orderStatus.textContent = 'Phục vụ món';
        orderStatus.classList.add('pending');
        orderCustomer.textContent = '-';
        orderRequestedBy.textContent = orderColumn.dataset.currentUser;
    };

    const clearSelectedTable = () => {
        const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`) || previewedTable;
        selectedTableId = null;
        document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected'));
        cart.clear();
        itemsSentToKitchen = false;
        setMenuUnlocked(false);
        renderCart();
        if (activeTable) showTablePreview(activeTable);
        tablePreviewArmed = false;
    };

    const openSelectedTable = (tableButton) => {
        selectedTableId = tableButton.dataset.tableId;
        previewedTable = tableButton;
        document.querySelectorAll('.table').forEach((button) => button.classList.remove('preview'));
        tableButton.classList.add('selected');
        cart.clear();
        itemsSentToKitchen = false;
        showSelectedTable(tableButton);
        selectionPrimaryAction.textContent = 'Hủy bàn';
        setSecondaryActions(false);
        setMenuUnlocked(true);
        renderCart();
    };

    const closeDialog = () => {
        dialog.hidden = true;
        dialogProduct = null;
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
            const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
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
            if (activeTable) activeTable.classList.remove('selected', 'kitchen-sent');
            closePaymentDialog();
            window.location.reload();
        } catch (error) {
            systemNotice.textContent = error.message;
            systemNotice.hidden = false;
            paymentConfirm.disabled = false;
        }
    });

    document.querySelectorAll('.pos-menu-item > button').forEach((menuButton) => {
        menuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            const currentMenu = menuButton.parentElement;
            document.querySelectorAll('.pos-menu-item').forEach((menu) => menu.classList.remove('open'));
            currentMenu.classList.toggle('open');
            menuButton.setAttribute('aria-expanded', String(currentMenu.classList.contains('open')));
        });
    });
    document.addEventListener('click', () => document.querySelectorAll('.pos-menu-item').forEach((menu) => {
        menu.classList.remove('open');
        const button = menu.querySelector(':scope > button');
        if (button) button.setAttribute('aria-expanded', 'false');
    }));

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
            systemNotice.textContent = systemMessages[actionButton.dataset.action];
            systemNotice.hidden = false;
            window.clearTimeout(systemNoticeTimeout);
            systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
        });
    });
    document.querySelector('#closing-dialog-close').addEventListener('click', closeClosingDialog);
    document.querySelector('#closing-cancel').addEventListener('click', closeClosingDialog);
    closingConfirm.addEventListener('click', async () => {
        closingConfirm.disabled = true;
        try {
            const response = await fetch(closingDialog.dataset.closeUrl, {
                method: 'POST',
                headers: { 'X-CSRFToken': document.querySelector('[name="csrfmiddlewaretoken"]').value },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Không thể kết ca.');
            closingDialog.hidden = true;
            closingSuccessDialog.hidden = false;
            window.setTimeout(() => document.querySelector('#closing-logout-form').submit(), 1200);
        } catch (error) {
            systemNotice.textContent = error.message;
            systemNotice.hidden = false;
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
            systemNotice.textContent = settingMessages[actionButton.dataset.setting];
            systemNotice.hidden = false;
            window.clearTimeout(systemNoticeTimeout);
            systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
        });
    });

    const invoiceContextMenu = document.querySelector('#invoice-context-menu');
    const invoiceEditDialog = document.querySelector('#invoice-edit-dialog');
    const invoiceDeleteDialog = document.querySelector('#invoice-delete-dialog');
    const invoiceEditReasonEnabled = document.querySelector('#invoice-edit-reason-enabled');
    const invoiceEditReason = document.querySelector('#invoice-edit-reason');
    const invoiceDeleteReasonEnabled = document.querySelector('#invoice-delete-reason-enabled');
    const invoiceDeleteReason = document.querySelector('#invoice-delete-reason');
    let selectedInvoiceRow = null;
    const invoiceActionMessages = {
        print: 'Đang in lại hóa đơn.',
        complete: 'Hóa đơn đã được đánh dấu hoàn tất thanh toán.',
        delete: 'Chức năng xóa hóa đơn cần xác nhận từ quản lý.',
        summary: 'Đã chọn tổng hợp hóa đơn.',
    };
    const closeInvoiceContextMenu = () => {
        invoiceContextMenu.hidden = true;
        if (selectedInvoiceRow) selectedInvoiceRow.classList.remove('invoice-selected');
    };
    const openInvoiceEditDialog = () => {
        if (!selectedInvoiceRow) return;
        const cells = selectedInvoiceRow.querySelectorAll('td');
        document.querySelector('#invoice-edit-title').textContent = `Sửa hóa đơn (Số ${cells[0].textContent.trim()}) - ${cells[3].textContent.trim()}`;
        document.querySelector('#invoice-edit-table').textContent = cells[1].textContent.trim();
        document.querySelector('#invoice-edit-cashier-option').textContent = cells[3].textContent.trim();
        document.querySelector('#invoice-edit-item-name').textContent = selectedInvoiceRow.dataset.itemName || `Hóa đơn ${cells[0].textContent.trim()}`;
        document.querySelector('#invoice-edit-item-price').textContent = selectedInvoiceRow.dataset.itemPrice || cells[6].textContent.trim();
        document.querySelector('#invoice-edit-item-quantity').textContent = selectedInvoiceRow.dataset.itemQuantity || '1';
        document.querySelector('#invoice-edit-subtotal').textContent = `${cells[4].textContent.trim()} đ`;
        document.querySelector('#invoice-edit-total').textContent = `${cells[6].textContent.trim()} đ`;
        invoiceEditReasonEnabled.checked = false;
        invoiceEditReason.value = '';
        invoiceEditReason.hidden = true;
        closeInvoiceContextMenu();
        invoiceEditDialog.hidden = false;
    };
    const closeInvoiceEditDialog = () => { invoiceEditDialog.hidden = true; };
    const openInvoiceDeleteDialog = () => {
        if (!selectedInvoiceRow) return;
        const invoiceCode = selectedInvoiceRow.querySelector('td').textContent.trim();
        document.querySelector('#invoice-delete-title').textContent = `Xóa hóa đơn số ${invoiceCode}`;
        invoiceDeleteReasonEnabled.checked = false;
        invoiceDeleteReason.value = '';
        invoiceDeleteReason.hidden = true;
        closeInvoiceContextMenu();
        invoiceDeleteDialog.hidden = false;
    };
    const closeInvoiceDeleteDialog = () => { invoiceDeleteDialog.hidden = true; };
    invoiceEditReasonEnabled.addEventListener('change', () => { invoiceEditReason.hidden = !invoiceEditReasonEnabled.checked; if (!invoiceEditReason.hidden) invoiceEditReason.focus(); });
    invoiceDeleteReasonEnabled.addEventListener('change', () => { invoiceDeleteReason.hidden = !invoiceDeleteReasonEnabled.checked; if (!invoiceDeleteReason.hidden) invoiceDeleteReason.focus(); });
    const showInvoiceContextMenu = (event, row) => {
        event.preventDefault();
        if (selectedInvoiceRow) selectedInvoiceRow.classList.remove('invoice-selected');
        selectedInvoiceRow = row;
        selectedInvoiceRow.classList.add('invoice-selected');
        invoiceContextMenu.hidden = false;
        const menuWidth = invoiceContextMenu.offsetWidth;
        const menuHeight = invoiceContextMenu.offsetHeight;
        invoiceContextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - menuWidth - 4)}px`;
        invoiceContextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - menuHeight - 4)}px`;
    };
    document.querySelectorAll('.invoice-table tbody tr[data-invoice-code]').forEach((row) => row.addEventListener('contextmenu', (event) => showInvoiceContextMenu(event, row)));
    invoiceContextMenu.querySelectorAll('button[data-invoice-action]').forEach((actionButton) => {
        actionButton.addEventListener('click', () => {
            if (actionButton.dataset.invoiceAction === 'edit') {
                openInvoiceEditDialog();
            } else if (actionButton.dataset.invoiceAction === 'delete') {
                openInvoiceDeleteDialog();
            } else if (!actionButton.disabled) {
                systemNotice.textContent = invoiceActionMessages[actionButton.dataset.invoiceAction];
                systemNotice.hidden = false;
                window.clearTimeout(systemNoticeTimeout);
                systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
                closeInvoiceContextMenu();
            }
        });
    });
    document.querySelector('#invoice-edit-close').addEventListener('click', closeInvoiceEditDialog);
    document.querySelector('#invoice-edit-cancel').addEventListener('click', closeInvoiceEditDialog);
    document.querySelector('#invoice-edit-confirm').addEventListener('click', async () => {
        if (!invoiceEditReasonEnabled.checked || !invoiceEditReason.value.trim()) {
            systemNotice.textContent = 'Hãy bật và nhập lý do sửa hóa đơn.';
            systemNotice.hidden = false;
            return;
        }
        const invoiceCode = selectedInvoiceRow.querySelector('td').textContent.trim();
        const response = await fetch(invoiceContextMenu.dataset.editUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': document.querySelector('[name="csrfmiddlewaretoken"]').value }, body: JSON.stringify({ invoice_code: invoiceCode, reason: invoiceEditReason.value.trim() }) });
        const result = await response.json();
        if (!response.ok) { systemNotice.textContent = result.error || 'Không thể ghi nhật ký sửa hóa đơn.'; systemNotice.hidden = false; return; }
        closeInvoiceEditDialog();
        window.location.reload();
    });
    document.querySelector('#invoice-delete-close').addEventListener('click', closeInvoiceDeleteDialog);
    document.querySelector('#invoice-delete-cancel').addEventListener('click', closeInvoiceDeleteDialog);
    document.querySelector('#invoice-delete-confirm').addEventListener('click', async () => {
        if (!invoiceDeleteReasonEnabled.checked || !invoiceDeleteReason.value.trim()) {
            systemNotice.textContent = 'Hãy bật và nhập lý do xóa hóa đơn.';
            systemNotice.hidden = false;
            return;
        }
        const invoiceCode = selectedInvoiceRow.querySelector('td').textContent.trim();
        const response = await fetch(invoiceContextMenu.dataset.deleteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': document.querySelector('[name="csrfmiddlewaretoken"]').value }, body: JSON.stringify({ invoice_code: invoiceCode, reason: invoiceDeleteReason.value.trim() }) });
        const result = await response.json();
        if (!response.ok) { systemNotice.textContent = result.error || 'Không thể xóa hóa đơn.'; systemNotice.hidden = false; return; }
        closeInvoiceDeleteDialog();
        window.location.reload();
    });
    document.addEventListener('click', (event) => {
        if (!invoiceContextMenu.contains(event.target) && !event.target.closest('.invoice-table')) closeInvoiceContextMenu();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeInvoiceContextMenu();
            closeInvoiceEditDialog();
            closeInvoiceDeleteDialog();
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
            systemNotice.textContent = managementMessages[actionButton.dataset.management];
            systemNotice.hidden = false;
            window.clearTimeout(systemNoticeTimeout);
            systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
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
            systemNotice.textContent = reportMessages[actionButton.dataset.report];
            systemNotice.hidden = false;
            window.clearTimeout(systemNoticeTimeout);
            systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
        });
    });

    const formatMoney = (amount) => `${amount.toLocaleString('vi-VN')} đ`;

    const renderCart = () => {
        orderItems.innerHTML = '';
        let subtotal = 0;
        cart.forEach((item) => {
            subtotal += item.price * item.quantity;
            const row = document.createElement('div');
            row.className = 'order-item new-item';
            row.innerHTML = `<b>${item.name}</b><span><strong>${item.quantity}</strong> ${item.unit} <i>${formatMoney(item.price * item.quantity)}</i></span>`;
            orderItems.appendChild(row);
        });
        if (!cart.size) {
            orderItems.innerHTML = selectedTableId ? '' : '<p class="empty-order">Chọn bàn để bắt đầu.</p>';
        }
        subtotalElement.textContent = formatMoney(subtotal);
        totalElement.textContent = formatMoney(subtotal);
        renderOpenAction();
    };

    document.querySelectorAll('.table').forEach((tableButton) => {
        tableButton.addEventListener('click', () => {
            if (selectedTableId === tableButton.dataset.tableId) {
                setMenuUnlocked(true);
                return;
            }
            if (!selectedTableId && previewedTable === tableButton && tablePreviewArmed) {
                openSelectedTable(tableButton);
                return;
            }
            document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected'));
            selectedTableId = null;
            cart.clear();
            itemsSentToKitchen = false;
            setMenuUnlocked(false);
            showTablePreview(tableButton);
            tablePreviewArmed = true;
            renderCart();
        });
    });

    document.querySelector('#open-menu').addEventListener('click', () => {
        if (!selectedTableId && previewedTable) {
            previewedTable.click();
        }
        if (selectedTableId) setMenuUnlocked(true);
    });
    document.querySelector('#collapse-order-menu').addEventListener('click', () => setMenuUnlocked(false));
    selectionPrimaryAction.addEventListener('click', () => {
        if (!selectedTableId && previewedTable) {
            openSelectedTable(previewedTable);
            return;
        }
        clearSelectedTable();
    });
    orderPrimaryAction.addEventListener('click', () => {
        if (!cart.size) {
            clearSelectedTable();
            return;
        }
        if (!itemsSentToKitchen) {
            itemsSentToKitchen = true;
            const activeTable = document.querySelector(`.table[data-table-id="${selectedTableId}"]`);
            if (activeTable) activeTable.classList.add('kitchen-sent');
            orderStatus.textContent = 'Đang phục vụ món';
            orderStatus.classList.add('pending');
            renderOpenAction();
            return;
        }
        openPaymentDialog();
    });

    document.querySelectorAll('.category').forEach((categoryButton) => {
        categoryButton.addEventListener('click', () => {
            document.querySelectorAll('.category').forEach((button) => button.classList.remove('active'));
            categoryButton.classList.add('active');
            menuTitle.textContent = categoryButton.dataset.category;
                document.querySelectorAll('.dish').forEach((dishButton) => {
                    dishButton.hidden = dishButton.dataset.categoryId !== categoryButton.dataset.categoryId;
                });
        });
    });

        const firstCategory = document.querySelector('.category.active');
        if (firstCategory) {
            document.querySelectorAll('.dish').forEach((dishButton) => {
                dishButton.hidden = dishButton.dataset.categoryId !== firstCategory.dataset.categoryId;
            });
        }

    document.querySelectorAll('.dish').forEach((dishButton) => {
        dishButton.addEventListener('click', () => {
            if (!menuUnlocked || !selectedTableId) return;
            dialogProduct = dishButton;
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
        const productId = dialogProduct.dataset.productId;
        const existing = cart.get(productId);
        const quantity = Number(dialogQuantity.value) || 1;
        cart.set(productId, {
            product_id: Number(productId),
            name: dialogProduct.dataset.dish,
            unit: dialogProduct.dataset.unit,
            price: Number(dialogProduct.dataset.price),
            quantity: existing ? existing.quantity + quantity : quantity,
        });
        itemsSentToKitchen = false;
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
