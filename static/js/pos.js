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

    const dialog = document.querySelector('#order-dialog');
    const menuColumn = document.querySelector('.menu-column');
    const posLayout = document.querySelector('.pos-layout');
    const dialogQuantity = document.querySelector('#dialog-quantity');
    const dialogPrice = document.querySelector('#dialog-price');

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
    };

    const closeDialog = () => {
        dialog.hidden = true;
        dialogProduct = null;
    };

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
            systemNotice.textContent = systemMessages[actionButton.dataset.action];
            systemNotice.hidden = false;
            window.clearTimeout(systemNoticeTimeout);
            systemNoticeTimeout = window.setTimeout(() => { systemNotice.hidden = true; }, 4200);
        });
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
            document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected'));
            document.querySelectorAll('.table').forEach((button) => button.classList.remove('preview'));
            tableButton.classList.add('selected');
            selectedTableId = tableButton.dataset.tableId;
            previewedTable = tableButton;
            cart.clear();
            itemsSentToKitchen = false;
            showSelectedTable(tableButton);
            selectionPrimaryAction.textContent = 'Hủy bàn';
            setSecondaryActions(false);
            setMenuUnlocked(false);
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
            previewedTable.click();
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
            renderOpenAction();
            return;
        }
        alert('Chức năng thanh toán sẽ được thực hiện tại quầy thu ngân.');
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
    if (firstTakeawayTable) showTablePreview(firstTakeawayTable);
});
