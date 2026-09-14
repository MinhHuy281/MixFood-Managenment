document.addEventListener('DOMContentLoaded', () => {
    const selectedTable = document.querySelector('#selected-table');
    const orderItems = document.querySelector('#order-items');
    const menuTitle = document.querySelector('#menu-title');

    document.querySelectorAll('.table').forEach((tableButton) => {
        tableButton.addEventListener('click', () => {
            document.querySelectorAll('.table').forEach((button) => button.classList.remove('selected'));
            tableButton.classList.add('selected');
            selectedTable.textContent = tableButton.textContent.trim();
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
            const item = document.createElement('div');
            item.className = 'order-item new-item';
            item.innerHTML = `<b>${dishButton.dataset.dish}</b><span><strong>1</strong> Phần <i>${Number(dishButton.dataset.price).toLocaleString('vi-VN')} đ</i></span>`;
            orderItems.appendChild(item);
        });
    });

    document.querySelectorAll('.record-tab').forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
            document.querySelectorAll('.record-tab').forEach((button) => button.classList.remove('active'));
            tabButton.classList.add('active');
        });
    });
});