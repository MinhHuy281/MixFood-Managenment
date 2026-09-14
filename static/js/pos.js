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
            renderCart();
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
            const productId = dishButton.dataset.productId;
            const existing = cart.get(productId);
            cart.set(productId, {
                product_id: Number(productId),
                name: dishButton.dataset.dish,
                unit: dishButton.dataset.unit,
                price: Number(dishButton.dataset.price),
                quantity: existing ? existing.quantity + 1 : 1,
            });
            renderCart();
        });
    });

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

    renderCart();
});