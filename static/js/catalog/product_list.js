// # File này chịu trách nhiệm xử lý trang Danh sách Món ăn: tìm kiếm nhanh, lọc theo nhóm danh mục, bật/tắt trạng thái bán và cập nhật thông tin món.
(() => {
    const formModal = document.getElementById('product-form-modal');
    const deleteModal = document.getElementById('product-delete-modal');
    const alertBanner = document.getElementById('product-alert-banner');

    let deleteTargetId = null;
    let currentCostPrice = 0;

    const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || (document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '');

    const showAlert = (message, type = 'success') => {
        if (!alertBanner) return;
        alertBanner.className = `menu-alert-banner ${type}`;
        alertBanner.textContent = message;
        alertBanner.hidden = false;
        setTimeout(() => { alertBanner.hidden = true; }, 4000);
    };

    const parseNum = val => Number(String(val).replace(/\D/g, '') || 0);
    const formatNum = val => parseNum(val).toLocaleString('vi-VN');

    const priceInput = document.getElementById('crud-dish-price');
    const price2Input = document.getElementById('crud-dish-price2');
    const price3Input = document.getElementById('crud-dish-price3');

    function updateModalMargin() {
        const p = parseNum(priceInput.value);
        const c = currentCostPrice;
        const profit = p - c;
        const margin = p > 0 ? ((profit / p) * 100).toFixed(1) : 0;

        document.getElementById('modal-live-cost').textContent = `${c.toLocaleString('vi-VN')} đ`;
        const marginEl = document.getElementById('modal-live-margin');
        marginEl.textContent = `${margin}%`;
        if (margin >= 50) marginEl.style.color = '#16a34a';
        else if (margin >= 30) marginEl.style.color = '#d97706';
        else marginEl.style.color = '#dc2626';
    }

    // Format tiền tệ khi nhập liệu
    [priceInput, price2Input, price3Input].forEach(inp => {
        if (!inp) return;
        inp.addEventListener('input', (e) => {
            e.target.value = formatNum(e.target.value);
            updateModalMargin();
        });
    });

    // Chọn nhanh ĐVT trong modal
    document.querySelectorAll('.btn-modal-unit-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('crud-dish-unit').value = btn.dataset.unit;
        });
    });

    // Tự sinh mã trong modal
    document.getElementById('btn-modal-auto-code')?.addEventListener('click', () => {
        const catSelect = document.getElementById('crud-dish-category');
        const catText = catSelect.selectedOptions[0]?.text || '';
        let prefix = 'M';
        if (catText && catText !== '-- Chọn danh mục --') {
            prefix = catText.split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 3) || 'M';
        }
        const rand = Math.floor(Math.random() * 90) + 10;
        document.getElementById('crud-dish-code').value = `${prefix}${rand}`;
    });

    // Mở modal Thêm mặt hàng
    document.getElementById('btn-open-add-product')?.addEventListener('click', () => {
        document.getElementById('product-form-modal-title').textContent = 'Thêm mặt hàng mới';
        document.getElementById('crud-dish-id').value = '';
        document.getElementById('crud-dish-code').value = '';
        document.getElementById('crud-dish-name').value = '';
        document.getElementById('crud-dish-subgroup').value = '';
        document.getElementById('crud-dish-unit').value = 'Phần';
        document.getElementById('crud-dish-price').value = '0';
        document.getElementById('crud-dish-price2').value = '0';
        document.getElementById('crud-dish-price3').value = '0';
        document.getElementById('crud-dish-available').checked = true;
        currentCostPrice = 0;
        document.getElementById('modal-recipe-link-box').hidden = true;
        updateModalMargin();
        formModal.hidden = false;
    });

    // Mở modal Sửa mặt hàng
    document.querySelectorAll('.btn-product-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            const dataStr = btn.getAttribute('data-dish');
            if (!dataStr) return;
            const data = JSON.parse(dataStr);

            document.getElementById('product-form-modal-title').textContent = `Chỉnh sửa mặt hàng: ${data.name}`;
            document.getElementById('crud-dish-id').value = data.id;
            document.getElementById('crud-dish-code').value = data.code || '';
            document.getElementById('crud-dish-name').value = data.name || '';
            document.getElementById('crud-dish-category').value = data.category_id || '';
            document.getElementById('crud-dish-subgroup').value = data.subgroup || '';
            document.getElementById('crud-dish-unit').value = data.unit || 'Phần';
            document.getElementById('crud-dish-price').value = Number(data.price || 0).toLocaleString('vi-VN');
            document.getElementById('crud-dish-price2').value = Number(data.price_2 || 0).toLocaleString('vi-VN');
            document.getElementById('crud-dish-price3').value = Number(data.price_3 || 0).toLocaleString('vi-VN');
            document.getElementById('crud-dish-type').value = data.product_type || 'food';
            document.getElementById('crud-dish-available').checked = !!data.is_available;

            currentCostPrice = Number(data.cost_price || 0);
            updateModalMargin();

            const recipeBox = document.getElementById('modal-recipe-link-box');
            const recipeLink = document.getElementById('modal-recipe-link-btn');
            recipeBox.hidden = false;
            recipeLink.href = `/inventory/recipes/?product_id=${data.id}`;

            formModal.hidden = false;
        });
    });

    // Đóng form modal
    const closeFormModal = () => { formModal.hidden = true; };
    document.getElementById('product-form-modal-close')?.addEventListener('click', closeFormModal);
    document.getElementById('btn-cancel-product-modal')?.addEventListener('click', closeFormModal);

    // Xử lý Lưu Mặt hàng (AJAX)
    document.getElementById('product-crud-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dishId = document.getElementById('crud-dish-id').value;
        const name = document.getElementById('crud-dish-name').value.trim();
        const code = document.getElementById('crud-dish-code').value.trim();
        const categoryId = document.getElementById('crud-dish-category').value;
        const subgroup = document.getElementById('crud-dish-subgroup').value.trim();
        const unit = document.getElementById('crud-dish-unit').value.trim();
        const price = document.getElementById('crud-dish-price').value.replace(/\D/g, '');
        const price2 = document.getElementById('crud-dish-price2').value.replace(/\D/g, '');
        const price3 = document.getElementById('crud-dish-price3').value.replace(/\D/g, '');
        const productType = document.getElementById('crud-dish-type').value;
        const isAvailable = document.getElementById('crud-dish-available').checked;

        if (!name) { alert('Vui lòng nhập tên mặt hàng.'); return; }
        if (!categoryId) { alert('Vui lòng chọn danh mục.'); return; }

        try {
            const resp = await fetch('/catalog/menu/api/save-dish/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken()
                },
                body: JSON.stringify({
                    dish_id: dishId ? Number(dishId) : null,
                    name: name,
                    code: code,
                    category_id: Number(categoryId),
                    subgroup: subgroup,
                    unit: unit,
                    price: price,
                    price_2: price2,
                    price_3: price3,
                    product_type: productType,
                    is_available: isAvailable,
                })
            });
            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Lỗi khi lưu mặt hàng.');

            closeFormModal();
            showAlert(res.message || 'Đã lưu mặt hàng thành công!');
            setTimeout(() => { window.location.reload(); }, 600);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Mở modal Xóa mặt hàng
    document.querySelectorAll('.btn-product-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteTargetId = btn.getAttribute('data-id');
            const name = btn.getAttribute('data-name');
            document.getElementById('delete-dish-name-text').textContent = `"${name}"`;
            deleteModal.hidden = false;
        });
    });

    // Đóng delete modal
    const closeDeleteModal = () => { deleteModal.hidden = true; deleteTargetId = null; };
    document.getElementById('product-delete-modal-close')?.addEventListener('click', closeDeleteModal);
    document.getElementById('btn-cancel-delete-modal')?.addEventListener('click', closeDeleteModal);

    // Xử lý Xóa mặt hàng (AJAX)
    document.getElementById('btn-confirm-delete-dish')?.addEventListener('click', async () => {
        if (!deleteTargetId) return;
        try {
            const resp = await fetch(`/catalog/menu/api/delete-dish/${deleteTargetId}/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': csrfToken()
                }
            });
            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa.');

            closeDeleteModal();
            showAlert(res.message || 'Đã xóa mặt hàng thành công!');
            setTimeout(() => { window.location.reload(); }, 600);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

})();

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-auto-submit="1"]').forEach((el) => {
        el.addEventListener('change', () => {
            if (el.form) el.form.submit();
        });
    });
});
