// # File này chịu trách nhiệm xử lý giao diện trang Quản lý Thực đơn (Menu Admin): quản lý nhóm món, thêm/sửa/xóa món ăn, tải ảnh món và nhập/xuất Excel.
document.addEventListener('DOMContentLoaded', () => {
    let selectedCatId = 'all';
    let selectedDishRow = null;
    let selectedCatPill = null;

    const alertBanner = document.getElementById('menu-admin-alert');
    const tableTbody = document.getElementById('dishes-table-tbody');
    const dishesCountBadge = document.getElementById('dishes-count-badge');
    const currentCatDisplay = document.getElementById('current-cat-display');
    const searchInput = document.getElementById('dish-search-input');
    const dishForm = document.getElementById('dish-editor-form');

    const formDishId = document.getElementById('form-dish-id');
    const formCategory = document.getElementById('form-dish-category');
    const formSubgroup = document.getElementById('form-dish-subgroup');
    const formCode = document.getElementById('form-dish-code');
    const formUnit = document.getElementById('form-dish-unit');
    const formName = document.getElementById('form-dish-name');
    const formPrice = document.getElementById('form-dish-price');
    const formPrice2 = document.getElementById('form-dish-price-2');
    const formPrice3 = document.getElementById('form-dish-price-3');
    const formType = document.getElementById('form-dish-type');
    const formReason = document.getElementById('form-dish-reason');
    const formAutoRecipe = document.getElementById('form-auto-recipe');
    const formTitle = document.getElementById('dish-form-title');
    const formModeBadge = document.getElementById('dish-form-mode-badge');

    const btnEditDish = document.getElementById('btn-trigger-edit-dish');
    const btnDelDish = document.getElementById('btn-trigger-del-dish');
    const btnAddDish = document.getElementById('btn-trigger-add-dish');
    const btnCancelDish = document.getElementById('btn-cancel-dish');

    const btnCatEdit = document.getElementById('btn-cat-edit');
    const btnCatDel = document.getElementById('btn-cat-del');
    const btnCatAdd = document.getElementById('btn-cat-add');

    // Show notice helper
    function showAlert(msg, isError = false) {
        alertBanner.textContent = msg;
        alertBanner.className = 'menu-alert-banner ' + (isError ? 'danger' : 'success');
        alertBanner.hidden = false;
        setTimeout(() => { alertBanner.hidden = true; }, 4000);
    }

    // Filter dishes by category and search
    function filterDishes() {
        const query = searchInput.value.toLowerCase().trim();
        const rows = tableTbody.querySelectorAll('.dish-row');
        let visibleCount = 0;

        rows.forEach(row => {
            const catId = row.dataset.catId;
            const code = (row.dataset.code || '').toLowerCase();
            const name = (row.dataset.name || '').toLowerCase();
            const sub = (row.dataset.subgroup || '').toLowerCase();

            const matchCat = (selectedCatId === 'all' || catId === selectedCatId);
            const matchQuery = (!query || code.includes(query) || name.includes(query) || sub.includes(query));

            if (matchCat && matchQuery) {
                row.hidden = false;
                visibleCount++;
            } else {
                row.hidden = true;
            }
        });

        dishesCountBadge.textContent = `${visibleCount} món`;
    }

    // Category pill selection
    document.querySelectorAll('.cat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedCatId = pill.dataset.catId;
            selectedCatPill = pill;

            if (selectedCatId === 'all') {
                currentCatDisplay.textContent = '[Tất cả]';
                btnCatEdit.disabled = true;
                btnCatDel.disabled = true;
            } else {
                currentCatDisplay.textContent = `[${pill.dataset.catName}]`;
                btnCatEdit.disabled = false;
                btnCatDel.disabled = false;
                // auto set form category
                formCategory.value = selectedCatId;
            }
            filterDishes();
        });
    });

    searchInput.addEventListener('input', filterDishes);

    const btnSwitchAdd = document.getElementById('btn-switch-add');
    if (btnSwitchAdd) btnSwitchAdd.addEventListener('click', resetDishForm);

    // Format VND helper (ví dụ: 15.000, 100.000)
    function formatVND(value) {
        if (value === null || value === undefined || value === '') return '0';
        const num = Math.round(Number(String(value).replace(/\./g, '').replace(/,/g, '')) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Setup live price inputs formatting
    function setupPriceInput(input) {
        if (!input) return;
        input.addEventListener('input', () => {
            const raw = input.value.replace(/\D/g, '');
            if (!raw) {
                input.value = '0';
                return;
            }
            const num = parseInt(raw, 10);
            input.value = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        });
        input.addEventListener('focus', () => {
            if (input.value === '0') input.select();
        });
    }
    setupPriceInput(formPrice);
    setupPriceInput(formPrice2);
    setupPriceInput(formPrice3);

    // Sort rows alphabetically by name (A -> B -> C ...)
    function sortDishRows() {
        const rows = Array.from(tableTbody.querySelectorAll('.dish-row'));
        rows.sort((a, b) => {
            const nameA = (a.dataset.name || '').trim();
            const nameB = (b.dataset.name || '').trim();
            return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
        });
        rows.forEach(r => tableTbody.appendChild(r));
    }

    // Row selection
    function bindRowEvents(row) {
        row.addEventListener('click', () => {
            if (selectedDishRow) selectedDishRow.classList.remove('selected');
            selectedDishRow = row;
            row.classList.add('selected');

            btnEditDish.disabled = false;
            btnDelDish.disabled = false;

            // Load into form
            loadDishIntoForm(row);
        });

        row.addEventListener('dblclick', () => {
            loadDishIntoForm(row);
            formName.focus();
        });
    }

    document.querySelectorAll('.dish-row').forEach(bindRowEvents);

    function loadDishIntoForm(row) {
        formDishId.value = row.dataset.id;
        formCategory.value = row.dataset.catId;
        formSubgroup.value = row.dataset.subgroup || '';
        formCode.value = row.dataset.code;
        formName.value = row.dataset.name;
        formUnit.value = row.dataset.unit || 'Phần';
        formPrice.value = formatVND(row.dataset.p1 || 0);
        formPrice2.value = formatVND(row.dataset.p2 || 0);
        formPrice3.value = formatVND(row.dataset.p3 || 0);
        formType.value = row.dataset.type || 'food';
        if (formReason) formReason.value = '';

        formTitle.textContent = `Sửa món: ${row.dataset.name}`;
        formModeBadge.textContent = 'Đang sửa';
        formModeBadge.className = 'form-mode-badge edit-mode';
        if (btnSwitchAdd) btnSwitchAdd.style.display = 'inline-flex';
    }

    function resetDishForm() {
        formDishId.value = '';
        if (selectedCatId !== 'all') {
            formCategory.value = selectedCatId;
        } else {
            formCategory.value = formCategory.options.length > 1 ? formCategory.options[1].value : '';
        }
        formSubgroup.value = '';
        formCode.value = '';
        formName.value = '';
        formUnit.value = 'Phần';
        formPrice.value = '0';
        formPrice2.value = '0';
        formPrice3.value = '0';
        formType.value = 'food';
        if (formReason) formReason.value = '';

        formTitle.textContent = 'Thêm món mới';
        formModeBadge.textContent = 'Tạo mới';
        formModeBadge.className = 'form-mode-badge';
        if (btnSwitchAdd) btnSwitchAdd.style.display = 'none';

        if (selectedDishRow) {
            selectedDishRow.classList.remove('selected');
            selectedDishRow = null;
        }
        btnEditDish.disabled = true;
        btnDelDish.disabled = true;
    }

    btnAddDish.addEventListener('click', resetDishForm);
    btnCancelDish.addEventListener('click', resetDishForm);
    btnEditDish.addEventListener('click', () => {
        if (selectedDishRow) loadDishIntoForm(selectedDishRow);
    });

    // Helper to update or insert dish in table with alphabetical sorting
    function updateOrInsertDish(dish, isEdit = false) {
        let row = tableTbody.querySelector(`.dish-row[data-id="${dish.id}"]`);
        const p1Formatted = formatVND(dish.price);
        const p2Formatted = formatVND(dish.price_2);
        const p3Formatted = formatVND(dish.price_3);

        const rowHtml = `
            <td class="col-cat"><span class="badge-cat">${dish.category_name}</span></td>
            <td class="col-sub">${dish.subgroup || '-'}</td>
            <td class="col-code"><code>${dish.code}</code></td>
            <td class="col-name"><strong>${dish.name}</strong></td>
            <td class="col-unit text-center">${dish.unit}</td>
            <td class="col-price text-right">${p1Formatted} đ</td>
            <td class="col-price-2 text-right">${p2Formatted} đ</td>
            <td class="col-price-3 text-right">${p3Formatted} đ</td>
            <td class="col-type text-center">
                <span class="badge-type type-${dish.product_type}">${dish.product_type_display}</span>
            </td>
        `;

        if (row) {
            row.dataset.catId = dish.category_id;
            row.dataset.subgroup = dish.subgroup || '';
            row.dataset.code = dish.code;
            row.dataset.name = dish.name;
            row.dataset.unit = dish.unit;
            row.dataset.p1 = dish.price;
            row.dataset.p2 = dish.price_2;
            row.dataset.p3 = dish.price_3;
            row.dataset.type = dish.product_type;
            row.innerHTML = rowHtml;
        } else {
            const emptyRow = tableTbody.querySelector('tr td.text-center');
            if (emptyRow) emptyRow.closest('tr')?.remove();

            row = document.createElement('tr');
            row.className = 'dish-row';
            row.dataset.id = dish.id;
            row.dataset.catId = dish.category_id;
            row.dataset.subgroup = dish.subgroup || '';
            row.dataset.code = dish.code;
            row.dataset.name = dish.name;
            row.dataset.unit = dish.unit;
            row.dataset.p1 = dish.price;
            row.dataset.p2 = dish.price_2;
            row.dataset.p3 = dish.price_3;
            row.dataset.type = dish.product_type;
            row.innerHTML = rowHtml;
            tableTbody.appendChild(row);
            bindRowEvents(row);
        }

        // NHẢY XẾP HÀNG THEO BẢNG CHỮ CÁI (A-B-C...)
        sortDishRows();
        filterDishes();

        // Cuộn mượt tới món vừa lưu và tạo hiệu ứng nhấp nháy nhận biết
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        row.classList.add('just-updated');
        setTimeout(() => row.classList.remove('just-updated'), 2000);

        if (isEdit) {
            if (selectedDishRow) selectedDishRow.classList.remove('selected');
            selectedDishRow = row;
            row.classList.add('selected');
            loadDishIntoForm(row);
        } else {
            // Thêm món mới xong -> Tự động reset form về Tạo mới để sẵn sàng thêm tiếp món khác, KHÔNG đè lên món vừa tạo
            resetDishForm();
            if (formCode) formCode.focus();
        }
    }

    // Sắp xếp Alphabet ngay khi tải trang
    sortDishRows();

    // Save Dish via AJAX
    dishForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-dish');
        const origText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Đang lưu...</span>';
        }

        const isEdit = Boolean(formDishId.value);
        const payload = {
            dish_id: formDishId.value,
            category_id: formCategory.value,
            subgroup: formSubgroup.value.trim(),
            code: formCode.value.trim().toUpperCase(),
            name: formName.value.trim(),
            unit: formUnit.value.trim() || 'Phần',
            price: formPrice.value.replace(/\./g, '').trim(),
            price_2: formPrice2.value.replace(/\./g, '').trim(),
            price_3: formPrice3.value.replace(/\./g, '').trim(),
            product_type: formType.value,
            reason: formReason ? formReason.value.trim() : '',
            auto_recipe: formAutoRecipe.checked,
        };

        const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;

        try {
            const resp = await fetch('/catalog/menu/api/save-dish/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken,
                },
                body: JSON.stringify(payload)
            });
            const res = await resp.json();
            if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi lưu món.');

            showAlert(res.message);
            if (res.dish) {
                updateOrInsertDish(res.dish, isEdit);
            }
        } catch (err) {
            showAlert(err.message, true);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        }
    });

    // Delete Dish with Reason Confirmation Modal
    const deleteDishModal = document.getElementById('modal-delete-dish-confirm');
    const deleteDishCloseBtn = document.getElementById('modal-delete-dish-close');
    const deleteDishCancelBtn = document.getElementById('modal-delete-dish-cancel');
    const deleteDishForm = document.getElementById('form-delete-dish-confirm');
    const deleteDishTargetName = document.getElementById('modal-delete-target-dish-name');
    const deleteDishTargetReason = document.getElementById('modal-delete-target-reason');

    if (deleteDishCloseBtn) deleteDishCloseBtn.addEventListener('click', () => { if (deleteDishModal) deleteDishModal.hidden = true; });
    if (deleteDishCancelBtn) deleteDishCancelBtn.addEventListener('click', () => { if (deleteDishModal) deleteDishModal.hidden = true; });

    btnDelDish.addEventListener('click', () => {
        if (!selectedDishRow) return;
        const name = selectedDishRow.dataset.name;
        const code = selectedDishRow.dataset.code;
        if (deleteDishTargetName) deleteDishTargetName.textContent = `"${name}" (${code})`;
        if (deleteDishTargetReason) {
            deleteDishTargetReason.value = '';
            setTimeout(() => deleteDishTargetReason.focus(), 100);
        }
        if (deleteDishModal) deleteDishModal.hidden = false;
    });

    if (deleteDishForm) {
        deleteDishForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedDishRow) return;
            const id = selectedDishRow.dataset.id;
            const reason = deleteDishTargetReason ? deleteDishTargetReason.value.trim() : '';

            const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
            try {
                const resp = await fetch(`/catalog/menu/api/delete-dish/${id}/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                    body: JSON.stringify({ reason: reason })
                });
                const res = await resp.json();
                if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi xóa món.');
                if (deleteDishModal) deleteDishModal.hidden = true;
                showAlert(res.message);
                selectedDishRow.remove();
                resetDishForm();
                filterDishes();
            } catch (err) {
                showAlert(err.message, true);
            }
        });
    }

    // Category Add & Edit Modals
    const catModal = document.getElementById('modal-category');
    const catModalTitle = document.getElementById('cat-modal-title');
    const modalCatId = document.getElementById('modal-cat-id');
    const modalCatName = document.getElementById('modal-cat-name');
    const modalCatColor = document.getElementById('modal-cat-color');
    const modalCatOrder = document.getElementById('modal-cat-order');

    btnCatAdd.addEventListener('click', () => {
        modalCatId.value = '';
        modalCatName.value = '';
        modalCatColor.value = '#f59e0b';
        modalCatOrder.value = 0;
        catModalTitle.textContent = 'Thêm danh mục mới';
        catModal.hidden = false;
        modalCatName.focus();
    });

    btnCatEdit.addEventListener('click', () => {
        if (!selectedCatPill || selectedCatId === 'all') return;
        modalCatId.value = selectedCatId;
        modalCatName.value = selectedCatPill.dataset.catName;
        modalCatColor.value = selectedCatPill.dataset.catColor || '#f59e0b';
        modalCatOrder.value = selectedCatPill.dataset.catOrder || 0;
        catModalTitle.textContent = `Sửa danh mục: ${selectedCatPill.dataset.catName}`;
        catModal.hidden = false;
        modalCatName.focus();
    });

    document.querySelectorAll('.preset-color').forEach(dot => {
        dot.addEventListener('click', () => {
            modalCatColor.value = dot.dataset.color;
        });
    });

    document.getElementById('modal-cat-close').addEventListener('click', () => { catModal.hidden = true; });
    document.getElementById('modal-cat-cancel').addEventListener('click', () => { catModal.hidden = true; });

    document.getElementById('form-category').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            category_id: modalCatId.value,
            name: modalCatName.value,
            color: modalCatColor.value,
            display_order: modalCatOrder.value,
        };
        const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
        try {
            const resp = await fetch('/catalog/menu/api/save-category/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(payload)
            });
            const res = await resp.json();
            if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi lưu danh mục.');
            showAlert(res.message);
            catModal.hidden = true;
            window.location.reload();
        } catch (err) {
            alert(err.message);
        }
    });

    // Delete Category
    btnCatDel.addEventListener('click', async () => {
        if (!selectedCatPill || selectedCatId === 'all') return;
        const name = selectedCatPill.dataset.catName;
        if (!confirm(`Bạn có chắc chắn muốn xóa danh mục "${name}"?`)) return;

        const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;
        try {
            const resp = await fetch(`/catalog/menu/api/delete-category/${selectedCatId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken }
            });
            const res = await resp.json();
            if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi xóa danh mục.');
            showAlert(res.message);
            window.location.reload();
        } catch (err) {
            showAlert(err.message, true);
        }
    });

    // Import Modal
    const importModal = document.getElementById('modal-import-excel');
    document.getElementById('page-btn-open-import').addEventListener('click', () => { importModal.hidden = false; });
    document.getElementById('modal-import-close').addEventListener('click', () => { importModal.hidden = true; });
    document.getElementById('modal-import-cancel').addEventListener('click', () => { importModal.hidden = true; });

    document.getElementById('form-import-excel').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const submitBtn = document.getElementById('btn-submit-import');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang nhập dữ liệu...';

        try {
            const resp = await fetch('/catalog/menu/import/', {
                method: 'POST',
                body: formData
            });
            const res = await resp.json();
            if (!resp.ok || res.error) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');
            alert(res.message);
            importModal.hidden = true;
            window.location.reload();
        } catch (err) {
            alert(err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Nhập dữ liệu';
        }
    });
});
