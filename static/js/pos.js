document.addEventListener('DOMContentLoaded', () => {
    const selectedTable = document.querySelector('#selected-table');
    const orderItems = document.querySelector('#order-items');
    const menuTitle = document.querySelector('#menu-title');
    const payButton = document.querySelector('#pay-button');
    const subtotalElement = document.querySelector('#order-subtotal');
    const totalElement = document.querySelector('#order-total');
    const paymentMethod = document.querySelector('#payment-method');
    const cart = new Map();
    let selectedTableId = null;
    let dialogProduct = null;
    let menuUnlocked = false;

    const dialog = document.querySelector('#order-dialog');
    const menuColumn = document.querySelector('.menu-column');
    const dialogQuantity = document.querySelector('#dialog-quantity');
    const dialogPrice = document.querySelector('#dialog-price');

    const setMenuUnlocked = (unlocked) => {
        menuUnlocked = unlocked;
        menuColumn.classList.toggle('menu-locked', !unlocked);
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
        });
    });
    document.addEventListener('click', () => document.querySelectorAll('.pos-menu-item').forEach((menu) => menu.classList.remove('open')));

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
            orderItems.innerHTML = '<p class="empty-order">Chọn món để bắt đầu.</p>';
        }
        subtotalElement.textContent = formatMoney(subtotal);
        totalElement.textContent = formatMoney(subtotal);
        payButton.disabled = !selectedTableId || !cart.size;
    };

    document.querySelectorAll('.table').forEach((tableButton) => {
        tableButton.addEventListener('click', () => {
            document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected'));
            tableButton.classList.add('selected');
            selectedTable.textContent = tableButton.textContent.trim();
            selectedTableId = tableButton.dataset.tableId;
            setMenuUnlocked(false);
            renderCart();
        });
        tableButton.addEventListener('dblclick', () => {
            selectedTableId = tableButton.dataset.tableId;
            selectedTable.textContent = tableButton.dataset.tableName;
            tableButton.classList.add('selected');
            setMenuUnlocked(true);
        });
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
        renderCart();
        closeDialog();
    });
    document.querySelector('#dialog-cancel').addEventListener('click', closeDialog);
    document.querySelector('#dialog-close').addEventListener('click', closeDialog);

    payButton.addEventListener('click', async () => {
        payButton.disabled = true;
        payButton.textContent = 'Đang thanh toán...';
        const csrfToken = document.cookie.split('; ').find((row) => row.startsWith('csrftoken='))?.split('=')[1];
        try {
            const response = await fetch('/sales/checkout/', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': csrfToken || ''},
                body: JSON.stringify({
                    table_id: Number(selectedTableId),
                    payment_method: paymentMethod.value,
                    items: Array.from(cart.values()).map(({product_id, quantity}) => ({product_id, quantity})),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Thanh toán thất bại.');
            alert(`Đã thanh toán ${result.invoice_code}`);
            window.location.reload();
        } catch (error) {
            alert(error.message);
            payButton.disabled = false;
            payButton.textContent = 'Thanh toán';
        }
    });

    document.querySelectorAll('.record-tab').forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
            document.querySelectorAll('.record-tab').forEach((button) => button.classList.remove('active'));
            tabButton.classList.add('active');
        });
    });

    setMenuUnlocked(false);
    renderCart();
});