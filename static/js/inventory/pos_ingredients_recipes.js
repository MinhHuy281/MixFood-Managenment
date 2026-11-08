// # File này chịu trách nhiệm xử lý hộp thoại Quản lý Mặt hàng Nguyên liệu (Ingredient Admin Modal) và Định lượng Nguyên liệu (Recipe BOM Modal) trên màn hình POS.
// =========================================================================
    // POS INGREDIENT ADMIN MODAL CONTROLLER (MẶT HÀNG - ADMIN TRÊN POS)
    // =========================================================================
    (() => {
        const modal = document.getElementById('pos-ingredient-admin-modal');
        const openBtn = document.getElementById('open-ingredient-admin-menu');
        const closeBtn = document.getElementById('pos-ingredient-modal-close');
        const alertBanner = document.getElementById('modal-pos-ing-alert');

        const searchInput = document.getElementById('modal-pos-ing-search');
        const groupFilter = document.getElementById('modal-pos-ing-group-filter');
        const tbody = document.getElementById('modal-pos-ing-tbody');
        const countSpan = document.getElementById('modal-pos-ing-count');

        const submodal = document.getElementById('pos-submodal-ingredient');
        const submodalExcel = document.getElementById('pos-submodal-ing-excel');

        let ingredientsData = [];
        let selectedId = null;
        let currentWarehouse = 'all';

        const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

        const showAlert = (message, type = 'success') => {
            if (!alertBanner) return;
            alertBanner.className = `menu-alert-banner ${type}`;
            alertBanner.textContent = message;
            alertBanner.hidden = false;
            setTimeout(() => { alertBanner.hidden = true; }, 4000);
        };

        const loadIngredientData = async () => {
            const q = searchInput?.value.trim() || '';
            const g = groupFilter?.value || '';
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (g) params.set('group', g);
            if (currentWarehouse && currentWarehouse !== 'all') params.set('warehouse', currentWarehouse);

            try {
                const resp = await fetch(`/catalog/ingredients/api/list/?${params.toString()}`);
                if (!resp.ok) throw new Error('Không thể tải dữ liệu mặt hàng.');
                const data = await resp.json();
                ingredientsData = data.ingredients || [];

                if (data.warehouse_counts) {
                    const cnt = data.warehouse_counts;
                    if (document.getElementById('modal-pos-wh-count-all')) document.getElementById('modal-pos-wh-count-all').textContent = cnt.all;
                    if (document.getElementById('modal-pos-wh-count-fresh')) document.getElementById('modal-pos-wh-count-fresh').textContent = cnt.fresh;
                    if (document.getElementById('modal-pos-wh-count-dry')) document.getElementById('modal-pos-wh-count-dry').textContent = cnt.dry;
                    if (document.getElementById('modal-pos-wh-count-beverage')) document.getElementById('modal-pos-wh-count-beverage').textContent = cnt.beverage;
                }

                // Cập nhật group filter options nếu chưa có
                if (groupFilter && data.groups) {
                    const cur = groupFilter.value;
                    groupFilter.innerHTML = '<option value="">-- Tất cả nhóm --</option>' +
                        data.groups.map(grp => `<option value="${grp}">${grp}</option>`).join('');
                    if (cur) groupFilter.value = cur;

                    const datalist = document.getElementById('pos-ing-group-datalist');
                    if (datalist) {
                        datalist.innerHTML = data.groups.map(grp => `<option value="${grp}">`).join('');
                    }
                }

                renderTable();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        };

        const renderTable = () => {
            if (!tbody) return;
            if (countSpan) countSpan.textContent = `${ingredientsData.length} mặt hàng`;

            if (ingredientsData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-table-row">Không tìm thấy mặt hàng nào trong kho này. Bấm "Thêm" để tạo mới.</td></tr>';
                selectedId = null;
                return;
            }

            tbody.innerHTML = ingredientsData.map(ing => {
                let whBadge = '';
                if (ing.storage_area === 'fresh') {
                    whBadge = '<span style="display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 800; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;">🥦 Kho 1</span>';
                } else if (ing.storage_area === 'dry') {
                    whBadge = '<span style="display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 800; background: #fffbeb; color: #d97706; border: 1px solid #fde68a;">🥫 Kho 2</span>';
                } else {
                    whBadge = '<span style="display: inline-block; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 800; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">🍹 Kho 3</span>';
                }

                return `
                    <tr data-id="${ing.id}" class="ingredient-row ${selectedId === ing.id ? 'selected' : ''}">
                        <td>${whBadge}</td>
                        <td>
                            <strong>${ing.name}</strong> <span class="text-muted" style="font-size: 11px; margin-left: 6px;">(${ing.code})</span>
                            <div style="font-size: 11.5px; color: #64748b;">${ing.group || '-'}</div>
                        </td>
                        <td style="text-align: center; font-weight: 700;">${ing.unit}</td>
                        <td>
                            <span style="display: inline-block; background: #fffbeb; border: 1px solid #fde68a; color: #b45309; padding: 2px 7px; border-radius: 6px; font-size: 11.5px; font-weight: 700;">
                                📦 ${ing.pack_rule_display || `1 ${ing.unit} = ${ing.pack_size || 10} ${ing.unpacked_unit || 'phần'}`}
                            </span>
                        </td>
                        <td style="text-align: right; font-weight: 700;">${ing.current_stock_formatted || '0.000'}</td>
                        <td style="text-align: left; font-weight: 700; color: #0284c7;">
                            ⏳ ${ing.portions_wait || '0 phần'}
                        </td>
                        <td style="text-align: right; font-weight: 700; color: #d97706;">${ing.cost_formatted}</td>
                    </tr>
                `;
            }).join('');

            tbody.querySelectorAll('.ingredient-row').forEach(row => {
                row.addEventListener('click', () => {
                    tbody.querySelectorAll('.ingredient-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                    selectedId = Number(row.dataset.id);
                });
                row.addEventListener('dblclick', () => {
                    selectedId = Number(row.dataset.id);
                    openEdit();
                });
            });
        };

        const openAdd = () => {
            document.getElementById('pos-submodal-ing-title').textContent = 'Thêm mặt hàng mới';
            document.getElementById('pos-ing-id').value = '';
            document.getElementById('pos-ing-group').value = groupFilter?.value || '';
            document.getElementById('pos-ing-name').value = '';
            document.getElementById('pos-ing-code').value = '';
            document.getElementById('pos-ing-unit').value = 'Kg';
            document.getElementById('pos-ing-cost').value = '0';
            document.getElementById('pos-ing-min-stock').value = '0.000';
            document.getElementById('pos-ing-supplier').value = '';
            if (document.getElementById('pos-ing-pack-size')) document.getElementById('pos-ing-pack-size').value = '10';
            if (document.getElementById('pos-ing-unpacked-unit')) document.getElementById('pos-ing-unpacked-unit').value = 'phần';

            const defWh = (currentWarehouse && currentWarehouse !== 'all') ? currentWarehouse : 'fresh';
            const radio = document.querySelector(`input[name="pos-ing-storage-area"][value="${defWh}"]`);
            if (radio) radio.checked = true;

            if (submodal) submodal.hidden = false;
        };

        const openEdit = () => {
            const ing = ingredientsData.find(i => i.id === selectedId);
            if (!ing) {
                showAlert('Vui lòng chọn một mặt hàng trong bảng để sửa.', 'error');
                return;
            }
            document.getElementById('pos-submodal-ing-title').textContent = 'Sửa mặt hàng';
            document.getElementById('pos-ing-id').value = ing.id;
            document.getElementById('pos-ing-group').value = ing.group || '';
            document.getElementById('pos-ing-name').value = ing.name;
            document.getElementById('pos-ing-code').value = ing.code;
            document.getElementById('pos-ing-unit').value = ing.unit;
            document.getElementById('pos-ing-cost').value = ing.cost_formatted;
            document.getElementById('pos-ing-min-stock').value = ing.minimum_stock_formatted;
            document.getElementById('pos-ing-supplier').value = ing.supplier || '';
            if (document.getElementById('pos-ing-pack-size')) document.getElementById('pos-ing-pack-size').value = ing.pack_size || 10;
            if (document.getElementById('pos-ing-unpacked-unit')) document.getElementById('pos-ing-unpacked-unit').value = ing.unpacked_unit || 'phần';

            const sa = ing.storage_area || 'fresh';
            const radio = document.querySelector(`input[name="pos-ing-storage-area"][value="${sa}"]`);
            if (radio) radio.checked = true;

            if (submodal) submodal.hidden = false;
        };

        // Open Modal from POS Dropdown Menu
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
                document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

                const doOpen = () => {
                    if (modal) {
                        modal.hidden = false;
                        loadIngredientData();
                    }
                };
                if (typeof window.requirePosPermission === 'function') {
                    window.requirePosPermission('manage_inventory', doOpen, 'Mặt hàng - Admin');
                } else {
                    doOpen();
                }
            });
        }

        // Close Modal
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.hidden = true;
            });
        }

        // Warehouse tabs switch in POS modal
        document.querySelectorAll('.btn-pos-wh-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-pos-wh-tab').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#ffffff';
                    b.style.color = '#334155';
                });
                btn.classList.add('active');
                currentWarehouse = btn.dataset.wh;
                if (currentWarehouse === 'all') {
                    btn.style.background = '#0f172a';
                    btn.style.color = '#ffffff';
                } else if (currentWarehouse === 'fresh') {
                    btn.style.background = '#16a34a';
                    btn.style.color = '#ffffff';
                } else if (currentWarehouse === 'dry') {
                    btn.style.background = '#d97706';
                    btn.style.color = '#ffffff';
                } else if (currentWarehouse === 'beverage') {
                    btn.style.background = '#2563eb';
                    btn.style.color = '#ffffff';
                }
                loadIngredientData();
            });
        });

        // Search & Filter
        searchInput?.addEventListener('input', () => { loadIngredientData(); });
        groupFilter?.addEventListener('change', () => { loadIngredientData(); });

        // Add, Edit, Delete Buttons
        document.getElementById('modal-pos-btn-add-ing')?.addEventListener('click', openAdd);
        document.getElementById('modal-pos-btn-edit-ing')?.addEventListener('click', openEdit);

        document.getElementById('pos-submodal-ing-close')?.addEventListener('click', () => { if (submodal) submodal.hidden = true; });
        document.getElementById('pos-submodal-ing-cancel')?.addEventListener('click', () => { if (submodal) submodal.hidden = true; });

        // Quick unit chips in POS ingredient modal
        document.querySelectorAll('#pos-submodal-ingredient .btn-pos-ing-unit-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const u = chip.dataset.unit;
                const unitInput = document.getElementById('pos-ing-unit');
                if (unitInput && u) {
                    unitInput.value = u;
                }
            });
        });
        document.querySelectorAll('#pos-submodal-ingredient .btn-pos-ing-pack-preset').forEach(preset => {
            preset.addEventListener('click', () => {
                const uInput = document.getElementById('pos-ing-unit');
                const pInput = document.getElementById('pos-ing-pack-size');
                const sInput = document.getElementById('pos-ing-unpacked-unit');
                if (uInput && preset.dataset.unit) uInput.value = preset.dataset.unit;
                if (pInput && preset.dataset.size) pInput.value = preset.dataset.size;
                if (sInput && preset.dataset.sub) sInput.value = preset.dataset.sub;
            });
        });

        // Auto generate code in POS ingredient modal
        document.getElementById('pos-btn-auto-ing-code')?.addEventListener('click', () => {
            const codeInput = document.getElementById('pos-ing-code');
            const rand = Math.floor(100 + Math.random() * 900);
            if (codeInput) {
                codeInput.value = `MH${rand}`;
            }
        });

        // Cost formatting mask
        const posCostInput = document.getElementById('pos-ing-cost');
        if (posCostInput) {
            posCostInput.addEventListener('input', () => {
                const num = parseInt(posCostInput.value.replace(/\D/g, ''), 10);
                posCostInput.value = isNaN(num) ? '0' : num.toLocaleString('vi-VN');
            });
        }

        // Save Form
        document.getElementById('pos-form-ingredient')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedArea = document.querySelector('input[name="pos-ing-storage-area"]:checked')?.value || 'fresh';
            const payload = {
                id: document.getElementById('pos-ing-id').value || undefined,
                storage_area: selectedArea,
                group: document.getElementById('pos-ing-group').value.trim(),
                name: document.getElementById('pos-ing-name').value.trim(),
                code: document.getElementById('pos-ing-code').value.trim(),
                unit: document.getElementById('pos-ing-unit').value.trim(),
                average_cost: document.getElementById('pos-ing-cost').value.trim(),
                minimum_stock: document.getElementById('pos-ing-min-stock').value.trim(),
                supplier: document.getElementById('pos-ing-supplier').value.trim(),
                pack_size: document.getElementById('pos-ing-pack-size')?.value || 10,
                unpacked_unit: document.getElementById('pos-ing-unpacked-unit')?.value.trim() || 'phần',
            };

            try {
                const resp = await fetch('/catalog/ingredients/api/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify(payload),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi lưu mặt hàng.');

                if (submodal) submodal.hidden = true;
                selectedId = res.ingredient.id;
                showAlert(res.message);
                await loadIngredientData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Delete Button
        document.getElementById('modal-pos-btn-del-ing')?.addEventListener('click', async () => {
            const ing = ingredientsData.find(i => i.id === selectedId);
            if (!ing) {
                showAlert('Vui lòng chọn mặt hàng cần xóa.', 'error');
                return;
            }
            if (!confirm(`Bạn có chắc muốn xóa mặt hàng "${ing.name}"?`)) return;

            try {
                const resp = await fetch(`/catalog/ingredients/api/delete/${ing.id}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa.');

                selectedId = null;
                showAlert(res.message);
                await loadIngredientData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Excel Import Submodal
        document.getElementById('modal-pos-btn-ing-excel-import')?.addEventListener('click', () => {
            if (submodalExcel) submodalExcel.hidden = false;
        });
        document.getElementById('pos-submodal-ing-excel-close')?.addEventListener('click', () => { if (submodalExcel) submodalExcel.hidden = true; });
        document.getElementById('pos-submodal-ing-excel-cancel')?.addEventListener('click', () => { if (submodalExcel) submodalExcel.hidden = true; });

        document.getElementById('pos-form-ing-excel')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('pos-ing-excel-file');
            const textInput = document.getElementById('pos-ing-excel-text');
            const formData = new FormData();

            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            } else if (textInput.value.trim()) {
                formData.append('csv_text', textInput.value.trim());
            } else {
                showAlert('Vui lòng chọn file hoặc dán dữ liệu mặt hàng.', 'error');
                return;
            }

            const btnSubmit = document.getElementById('pos-btn-submit-ing-excel');
            if (btnSubmit) btnSubmit.disabled = true;

            try {
                const resp = await fetch('/catalog/ingredients/import/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                    body: formData,
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');

                showAlert(res.message);
                if (submodalExcel) submodalExcel.hidden = true;
                fileInput.value = '';
                textInput.value = '';
                await loadIngredientData();
            } catch (err) {
                showAlert(err.message, 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        });
    })();

    // =========================================================================
    // POS RECIPE ADMIN MODAL CONTROLLER (ĐỊNH LƯỢNG NGUYÊN LIỆU TRÊN POS)
    // =========================================================================
    (() => {
        const modal = document.getElementById('pos-recipe-admin-modal');
        const openBtn = document.getElementById('open-recipe-admin-menu');
        const closeBtn = document.getElementById('pos-recipe-modal-close');
        const alertBanner = document.getElementById('modal-pos-recipe-alert');

        const dishSearch = document.getElementById('modal-pos-recipe-dish-search');
        const catFilter = document.getElementById('modal-pos-recipe-cat-filter');
        const dishList = document.getElementById('modal-pos-recipe-dish-list');
        const dishesCountSpan = document.getElementById('modal-pos-recipe-dishes-count');

        const noSelectionBox = document.getElementById('modal-pos-recipe-no-selection');
        const selectionWrap = document.getElementById('modal-pos-recipe-selection-wrap');

        const submodalItem = document.getElementById('pos-submodal-recipe-item');
        const submodalExcel = document.getElementById('pos-submodal-recipe-excel');

        let selectedProductId = null;
        let productsData = [];
        let ingredientsData = [];
        let selectedRecipe = null;

        const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

        const showAlert = (message, type = 'success') => {
            if (!alertBanner) return;
            alertBanner.className = `menu-alert-banner ${type}`;
            alertBanner.textContent = message;
            alertBanner.hidden = false;
            setTimeout(() => { alertBanner.hidden = true; }, 4000);
        };

        const loadRecipeData = async (selectFirstIfNone = false) => {
            const q = dishSearch?.value.trim() || '';
            const catId = catFilter?.value || '';
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (catId) params.set('category_id', catId);
            if (selectedProductId) params.set('product_id', selectedProductId);

            try {
                const resp = await fetch(`/inventory/recipes/api/data/?${params.toString()}`);
                if (!resp.ok) throw new Error('Không thể tải dữ liệu định lượng.');
                const data = await resp.json();
                productsData = data.products || [];
                ingredientsData = data.ingredients || [];
                selectedRecipe = data.selected_recipe || null;

                if (catFilter && data.categories && catFilter.options.length <= 1) {
                    catFilter.innerHTML = '<option value="">-- Tất cả danh mục --</option>' +
                        data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }

                renderDishList();
                populateIngredientSelect();

                if (selectedProductId && selectedRecipe) {
                    renderRecipeDetails();
                } else if (selectFirstIfNone && productsData.length > 0) {
                    selectedProductId = productsData[0].id;
                    await loadRecipeData(false);
                } else {
                    if (noSelectionBox) noSelectionBox.hidden = false;
                    if (selectionWrap) selectionWrap.hidden = true;
                }
            } catch (err) {
                showAlert(err.message, 'error');
            }
        };

        const renderDishList = () => {
            if (!dishList) return;
            if (dishesCountSpan) dishesCountSpan.textContent = `${productsData.length} món`;

            if (productsData.length === 0) {
                dishList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 13px;">Không tìm thấy món ăn nào.</div>';
                return;
            }

            dishList.innerHTML = productsData.map(p => `
                <div class="recipe-dish-item ${selectedProductId === p.id ? 'active' : ''}" data-id="${p.id}">
                    <div class="dish-item-top">
                        <strong class="dish-item-name">${p.name}</strong>
                        <span class="dish-item-badge ${p.has_recipe ? 'badge-has-recipe' : 'badge-no-recipe'}">
                            ${p.has_recipe ? `${p.items_count} NL` : 'Chưa định lượng'}
                        </span>
                    </div>
                    <div class="dish-item-bottom">
                        <span class="dish-item-code">${p.code} (${p.unit})</span>
                        <div class="dish-item-prices">
                            <span class="dish-price">${p.price_formatted} đ</span>
                            ${p.has_recipe ? `<span class="dish-cost">Vốn: ${p.cost_price_formatted} đ</span>` : ''}
                        </div>
                    </div>
                </div>
            `).join('');

            dishList.querySelectorAll('.recipe-dish-item').forEach(item => {
                item.addEventListener('click', async () => {
                    selectedProductId = Number(item.dataset.id);
                    await loadRecipeData(false);
                });
            });
        };

        const renderRecipeDetails = () => {
            if (!selectedRecipe) {
                if (noSelectionBox) noSelectionBox.hidden = false;
                if (selectionWrap) selectionWrap.hidden = true;
                return;
            }

            if (noSelectionBox) noSelectionBox.hidden = true;
            if (selectionWrap) selectionWrap.hidden = false;

            document.getElementById('modal-pos-recipe-cat-badge').textContent = selectedRecipe.category_name;
            document.getElementById('modal-pos-recipe-dish-name').textContent = selectedRecipe.product_name;
            document.getElementById('modal-pos-recipe-dish-code').textContent = `Mã: ${selectedRecipe.product_code} • ĐVT: ${selectedRecipe.product_unit}`;

            document.getElementById('modal-pos-recipe-price').textContent = `${selectedRecipe.price_formatted} đ`;
            document.getElementById('modal-pos-recipe-cost').textContent = `${selectedRecipe.total_cost_formatted} đ`;
            document.getElementById('modal-pos-recipe-profit').textContent = `${selectedRecipe.profit_formatted} đ`;

            const marginEl = document.getElementById('modal-pos-recipe-margin');
            if (marginEl) {
                marginEl.textContent = `${selectedRecipe.margin_pct}%`;
                if (selectedRecipe.margin_pct >= 50) {
                    marginEl.className = 'kpi-val badge-margin margin-high';
                } else if (selectedRecipe.margin_pct >= 30) {
                    marginEl.className = 'kpi-val badge-margin margin-med';
                } else {
                    marginEl.className = 'kpi-val badge-margin margin-low';
                }
            }

            const itemsTbody = document.getElementById('modal-pos-recipe-items-tbody');
            const itemsCountEl = document.getElementById('modal-pos-recipe-items-count');
            const items = selectedRecipe.items || [];

            if (itemsCountEl) itemsCountEl.textContent = `${items.length} nguyên liệu`;

            if (!itemsTbody) return;

            if (items.length === 0) {
                itemsTbody.innerHTML = '<tr><td colspan="7" class="empty-table-row">Món này chưa có nguyên liệu định lượng. Nhấn "+ Thêm nguyên liệu" để bắt đầu!</td></tr>';
                return;
            }

            itemsTbody.innerHTML = items.map((it, idx) => `
                <tr data-item-id="${it.item_id}">
                    <td style="text-align: center; color: #94a3b8;">${idx + 1}</td>
                    <td>${it.ingredient_group || '-'}</td>
                    <td><strong>${it.ingredient_name}</strong> <span class="text-muted" style="font-size: 11px;">(${it.ingredient_code})</span></td>
                    <td style="text-align: right; font-weight: 600; color: #1e293b;">${it.quantity_formatted}</td>
                    <td style="text-align: center;">${it.unit}</td>
                    <td style="text-align: right; font-weight: 600; color: #0284c7;">${it.total_cost_formatted} đ</td>
                    <td style="text-align: center;">
                        <button type="button" class="btn-del-item-icon" data-item-id="${it.item_id}" title="Xóa nguyên liệu">&times;</button>
                    </td>
                </tr>
            `).join('');

            itemsTbody.querySelectorAll('.btn-del-item-icon').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const itemId = btn.dataset.itemId;
                    if (!confirm('Bạn có chắc muốn xóa nguyên liệu này khỏi công thức?')) return;

                    try {
                        const resp = await fetch(`/inventory/recipes/api/delete-item/${itemId}/`, {
                            method: 'POST',
                            headers: { 'X-CSRFToken': csrfToken() },
                        });
                        const res = await resp.json();
                        if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa.');

                        showAlert(res.message);
                        await loadRecipeData(false);
                    } catch (err) {
                        showAlert(err.message, 'error');
                    }
                });
            });
        };

        let posRecipeWhFilter = 'all';
        let posRecipeIngSearchQuery = '';

        const removeVietnameseTones = (str) => {
            if (!str) return '';
            str = str.toLowerCase();
            str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
            str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
            str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
            str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
            str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
            str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
            str = str.replace(/đ/g, 'd');
            str = str.replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '');
            str = str.replace(/[\u02C6\u0306\u031B]/g, '');
            return str.trim();
        };

        const populateIngredientSelect = () => {
            const ingSelect = document.getElementById('pos-recipe-item-ingredient');
            const quickSelect = document.getElementById('pos-quick-add-ingredient');
            const matchCountEl = document.getElementById('pos-quick-add-ing-match-count');

            // 1. Lọc theo Kho
            let filtered = (posRecipeWhFilter && posRecipeWhFilter !== 'all')
                ? ingredientsData.filter(i => i.storage_area === posRecipeWhFilter)
                : ingredientsData.slice();

            // 2. Lọc theo từ khóa tìm kiếm (hỗ trợ có dấu và không dấu, mã, tên, nhóm)
            const qRaw = posRecipeIngSearchQuery.trim().toLowerCase();
            const qNorm = removeVietnameseTones(qRaw);

            if (qRaw) {
                filtered = filtered.filter(i => {
                    const name = (i.name || '').toLowerCase();
                    const code = (i.code || '').toLowerCase();
                    const group = (i.group || '').toLowerCase();
                    const nameNorm = removeVietnameseTones(name);
                    const codeNorm = removeVietnameseTones(code);
                    const groupNorm = removeVietnameseTones(group);

                    return name.includes(qRaw) || code.includes(qRaw) || group.includes(qRaw) ||
                           nameNorm.includes(qNorm) || codeNorm.includes(qNorm) || groupNorm.includes(qNorm);
                });
            }

            if (matchCountEl) {
                if (qRaw) {
                    matchCountEl.hidden = false;
                    matchCountEl.textContent = `${filtered.length} kết quả khớp`;
                } else {
                    matchCountEl.hidden = true;
                }
            }

            // 3. Sắp xếp Alphabet A-Z tiếng Việt
            const sortVietnamese = (a, b) => (a.name || '').localeCompare((b.name || ''), 'vi', { sensitivity: 'base' });

            const freshList = filtered.filter(i => i.storage_area === 'fresh').sort(sortVietnamese);
            const dryList = filtered.filter(i => i.storage_area === 'dry').sort(sortVietnamese);
            const bevList = filtered.filter(i => i.storage_area === 'beverage').sort(sortVietnamese);

            let optionsHtml = '<option value="">-- Chọn mặt hàng từ kho --</option>';
            if (freshList.length) {
                optionsHtml += `<optgroup label="🥦 Kho 1: Tươi sống & Rau củ quả (${freshList.length})">`;
                freshList.forEach(ing => {
                    optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-name="${ing.name}" data-pack-size="${ing.pack_size || 1}">
                        [Kho 1] ${ing.name} (${ing.unit} - ${ing.cost_formatted} đ)
                    </option>`;
                });
                optionsHtml += '</optgroup>';
            }
            if (dryList.length) {
                optionsHtml += `<optgroup label="🥫 Kho 2: Khô, Gia vị & Bao bì (${dryList.length})">`;
                dryList.forEach(ing => {
                    optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-name="${ing.name}" data-pack-size="${ing.pack_size || 1}">
                        [Kho 2] ${ing.name} (${ing.unit} - ${ing.cost_formatted} đ)
                    </option>`;
                });
                optionsHtml += '</optgroup>';
            }
            if (bevList.length) {
                optionsHtml += `<optgroup label="🍹 Kho 3: Đồ uống & Trái cây (${bevList.length})">`;
                bevList.forEach(ing => {
                    optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-name="${ing.name}" data-pack-size="${ing.pack_size || 1}">
                        [Kho 3] ${ing.name} (${ing.unit} - ${ing.cost_formatted} đ)
                    </option>`;
                });
                optionsHtml += '</optgroup>';
            }

            if (ingSelect) {
                const cur = ingSelect.value;
                ingSelect.innerHTML = optionsHtml;
                if (cur) ingSelect.value = cur;
            }
            if (quickSelect) {
                const cur = quickSelect.value;
                quickSelect.innerHTML = optionsHtml;
                if (cur && filtered.some(i => i.id == cur)) {
                    quickSelect.value = cur;
                } else if (qRaw && filtered.length === 1) {
                    quickSelect.value = filtered[0].id;
                    quickSelect.dispatchEvent(new Event('change'));
                }
            }
        };

        const updatePosQuickAddPreview = () => {
            const quickSelect = document.getElementById('pos-quick-add-ingredient');
            const qtyInput = document.getElementById('pos-quick-add-qty');
            const unitInput = document.getElementById('pos-quick-add-unit');
            const previewEl = document.getElementById('pos-quick-add-cost-preview');
            const hintEl = document.getElementById('pos-quick-add-calc-hint');
            if (!quickSelect || !previewEl) return;

            const opt = quickSelect.selectedOptions[0];
            if (!opt || !opt.dataset.cost) {
                previewEl.textContent = '0 đ';
                if (hintEl) hintEl.hidden = true;
                return;
            }

            const cost = Number(opt.dataset.cost) || 0;
            const stockUnit = opt.dataset.unit || '';
            const ingName = opt.dataset.name || '';
            const qty = Number(qtyInput?.value) || 0;
            const unit = unitInput?.value.trim() || stockUnit;

            const packSize = Number(opt.dataset.packSize) || 1;
            const conv = convertRecipeToStockQty(ingName, stockUnit, qty, unit, packSize);
            const total = conv.stockQty * cost;

            previewEl.textContent = `${Math.round(total).toLocaleString('vi-VN')} đ`;
            if (hintEl) {
                if (conv.hint) {
                    hintEl.textContent = `⚡ ${conv.hint}`;
                    hintEl.hidden = false;
                } else {
                    hintEl.hidden = true;
                }
            }
        };

        const convertRecipeToStockQty = (ingName, stockUnit, qty, recipeUnit, packSize = 1) => {
            if (!qty || isNaN(qty)) return { stockQty: 0, hint: '' };
            const q = Number(qty);
            const rUnit = (recipeUnit || '').trim().toLowerCase();
            const sUnit = (stockUnit || '').trim().toLowerCase();
            const name = (ingName || '').toLowerCase();
            const pSize = (packSize && Number(packSize) > 1) ? Number(packSize) : 1;

            // Bánh phồng tôm (1 hộp = 100 cái bánh, 1 phần = 10 cái = 0.1 hộp)
            if (name.includes('phồng tôm') || name.includes('phong tom') || name.includes('phongtom')) {
                if (['cái', 'cai', 'bánh', 'banh', 'miếng', 'mieng'].some(k => rUnit.includes(k))) {
                    if (['hộp', 'hop', 'gói', 'goi'].some(k => sUnit.includes(k))) {
                        return { stockQty: q / 100, hint: `Quy đổi: ${q} cái bánh phồng = ${(q / 100).toFixed(2)} hộp (1 hộp = 100 cái = 80.000đ)` };
                    }
                } else if (['phần', 'phan', 'dĩa', 'dia'].some(k => rUnit.includes(k))) {
                    if (['hộp', 'hop', 'gói', 'goi'].some(k => sUnit.includes(k))) {
                        return { stockQty: q * 0.1, hint: `Quy đổi: ${q} phần = ${(q * 10)} cái = ${(q * 0.1).toFixed(2)} hộp (vốn 8.000đ/phần)` };
                    }
                }
            }

                        // Sữa đặc Ông Thọ (Hộp 380g => g -> Hộp)
            if (name.includes('sữa đặc') || name.includes('sua dac')) {
                if (['g', 'gram', 'gr', 'gam', 'ml'].includes(rUnit)) {
                    return { stockQty: q / 380, hint: `Quy đổi: ${q} ${rUnit} = ${(q / 380).toFixed(3)} hộp sữa đặc (380g/hộp)` };
                }
                if (['thìa', 'muỗng', 'muong', 'thia'].includes(rUnit)) {
                    return { stockQty: (q * 15) / 380, hint: `Quy đổi: ${q} thìa sữa = ${((q * 15) / 380).toFixed(3)} hộp` };
                }
            }

            // Sữa tươi không đường (Hộp 1000ml => ml -> Hộp)
            if (name.includes('sữa tươi') || name.includes('sua tuoi')) {
                if (['ml', 'mililit', 'cc'].includes(rUnit)) {
                    return { stockQty: q / 1000, hint: `Quy đổi: ${q} ml = ${(q / 1000).toFixed(3)} hộp sữa tươi (1L/hộp)` };
                }
            }

            // Trà Thái đỏ / Trà Thái xanh / Trà túi lọc (Gói 400g => g -> Gói, túi -> /50)
            if (name.includes('trà thái') || name.includes('tra thai') || name.includes('túi lọc') || name.includes('tui loc')) {
                if (['g', 'gram', 'gr', 'gam'].includes(rUnit)) {
                    return { stockQty: q / 400, hint: `Quy đổi: ${q} g cốt trà = ${(q / 400).toFixed(3)} gói (400g/gói)` };
                }
                if (['túi', 'tui', 'gói', 'goi'].includes(rUnit) && ['gói', 'goi', 'hộp', 'hop'].includes(sUnit)) {
                    return { stockQty: q / 50, hint: `Quy đổi: ${q} túi lọc = ${(q / 50).toFixed(3)} gói trà (50 túi/gói)` };
                }
            }

            // Tương ớt Cholimex / Sốt chai (Chai 270g => g -> Chai)
            if (name.includes('tương ớt') || name.includes('tuong ot')) {
                if (['g', 'gram', 'gr', 'gam'].includes(rUnit)) {
                    return { stockQty: q / 270, hint: `Quy đổi: ${q} g tương ớt = ${(q / 270).toFixed(3)} chai (270g/chai)` };
                }
            }

            // Nước cốt dừa (Chai/Lít 1000ml => ml -> Lít)
            if (name.includes('cốt dừa') || name.includes('cot dua')) {
                if (['ml', 'mililit', 'cc'].includes(rUnit)) {
                    return { stockQty: q / 1000, hint: `Quy đổi: ${q} ml cốt dừa = ${(q / 1000).toFixed(3)} Lít` };
                }
            }

            if (['chén', 'chen', 'bát', 'bat', 'phần', 'phan', 'dĩa', 'dia'].some(k => rUnit.includes(k)) && (name.includes('gạo') || name.includes('gao'))) {
                return { stockQty: q * 0.1, hint: `Quy đổi: ${q} chén cơm = ${(q * 0.1).toFixed(3)} kg Gạo` };
            }
            if (['phần', 'phan', 'chén', 'chen'].some(k => rUnit.includes(k)) && (name.includes('nếp') || name.includes('nep'))) {
                return { stockQty: q * 0.1, hint: `Quy đổi: ${q} phần xôi = ${(q * 0.1).toFixed(3)} kg Nếp` };
            }
            if (rUnit.includes('con') && (name.includes('cá') || name.includes('ca')) && ['kg', 'kilogram'].includes(sUnit)) {
                return { stockQty: q * 0.8, hint: `Quy đổi: ${q} con cá ~ ${(q * 0.8).toFixed(3)} kg` };
            }
            if (['g', 'gram', 'gr', 'gam'].includes(rUnit) && ['kg', 'kilogram'].includes(sUnit)) {
                return { stockQty: q / 1000, hint: `Quy đổi: ${q} g = ${(q / 1000).toFixed(3)} kg` };
            }
            if (['ml', 'mililit', 'cc'].includes(rUnit) && ['l', 'lít', 'lit', 'liter'].includes(sUnit)) {
                return { stockQty: q / 1000, hint: `Quy đổi: ${q} ml = ${(q / 1000).toFixed(3)} Lít` };
            }
            if (['thùng', 'thung', 'vỉ', 'vi', 'két', 'ket', 'bao'].includes(sUnit) && pSize > 1) {
                if (rUnit !== sUnit) {
                    return { stockQty: q / pSize, hint: `Quy đổi: ${q} ${rUnit} = ${(q / pSize).toFixed(4)} ${stockUnit} (1 ${stockUnit} = ${pSize} hộp/đơn vị)` };
                }
            }
            return { stockQty: q, hint: '' };
        };

        const updateCostPreview = () => {
            const ingSelect = document.getElementById('pos-recipe-item-ingredient');
            const qtyInput = document.getElementById('pos-recipe-item-qty');
            const unitInput = document.getElementById('pos-recipe-item-unit');
            const unitCostEl = document.getElementById('pos-recipe-preview-unit-cost');
            const totalCostEl = document.getElementById('pos-recipe-preview-total-cost');
            const hintEl = document.getElementById('pos-recipe-modal-calc-hint');

            const opt = ingSelect?.selectedOptions[0];
            if (!opt || !opt.dataset.cost) {
                if (unitCostEl) unitCostEl.textContent = '0 đ';
                if (totalCostEl) totalCostEl.textContent = '0 đ';
                if (hintEl) hintEl.hidden = true;
                return;
            }

            const cost = Number(opt.dataset.cost) || 0;
            const stockUnit = opt.dataset.unit || '';
            const ingName = opt.dataset.name || '';
            const qty = Number(qtyInput?.value) || 0;
            const unit = unitInput?.value.trim() || stockUnit;

            if (unitCostEl) unitCostEl.textContent = `${cost.toLocaleString('vi-VN')} đ / ${stockUnit}`;

            const packSize = Number(opt.dataset.packSize) || 1;
            const conv = convertRecipeToStockQty(ingName, stockUnit, qty, unit, packSize);
            const total = conv.stockQty * cost;

            if (totalCostEl) totalCostEl.textContent = `${Math.round(total).toLocaleString('vi-VN')} đ`;
            if (hintEl) {
                if (conv.hint) {
                    hintEl.textContent = `ℹ️ ${conv.hint}`;
                    hintEl.hidden = false;
                } else {
                    hintEl.hidden = true;
                }
            }
        };

        // Open Modal from POS Dropdown Menu
        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
                document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

                const doOpen = () => {
                    if (modal) {
                        modal.hidden = false;
                        loadRecipeData(true);
                    }
                };
                if (typeof window.requirePosPermission === 'function') {
                    window.requirePosPermission('manage_inventory', doOpen, 'Định lượng nguyên liệu');
                } else {
                    doOpen();
                }
            });
        }

        // Close Modal
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (modal) modal.hidden = true;
            });
        }

        // Search & Filter
        dishSearch?.addEventListener('input', () => { loadRecipeData(false); });
        catFilter?.addEventListener('change', () => { loadRecipeData(false); });

        // Add recipe item
        document.getElementById('modal-pos-btn-add-recipe-item')?.addEventListener('click', () => {
            if (!selectedProductId) return;
            const ingSelect = document.getElementById('pos-recipe-item-ingredient');
            if (ingSelect) ingSelect.value = '';
            document.getElementById('pos-recipe-item-qty').value = '0.100';
            document.getElementById('pos-recipe-item-unit').value = '';
            updateCostPreview();
            if (submodalItem) submodalItem.hidden = false;
        });

        document.getElementById('pos-submodal-recipe-item-close')?.addEventListener('click', () => { if (submodalItem) submodalItem.hidden = true; });
        document.getElementById('pos-submodal-recipe-item-cancel')?.addEventListener('click', () => { if (submodalItem) submodalItem.hidden = true; });

        document.getElementById('pos-recipe-item-ingredient')?.addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            if (opt && opt.dataset.unit) {
                document.getElementById('pos-recipe-item-unit').value = opt.dataset.unit;
            }
            updateCostPreview();
        });
        document.getElementById('pos-recipe-item-qty')?.addEventListener('input', updateCostPreview);
        document.querySelectorAll('.btn-pos-modal-unit-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('pos-recipe-item-unit').value = btn.dataset.unit;
                updateCostPreview();
            });
        });

        document.getElementById('pos-recipe-item-unit')?.addEventListener('input', updateCostPreview);

        // Event Listeners cho ô Tìm kiếm Nguyên liệu nhanh trong POS Modal
        const posIngSearchInput = document.getElementById('pos-quick-add-ing-search');
        const posIngSearchClear = document.getElementById('pos-quick-add-ing-search-clear');

        if (posIngSearchInput) {
            posIngSearchInput.addEventListener('input', (e) => {
                posRecipeIngSearchQuery = e.target.value;
                if (posIngSearchClear) {
                    posIngSearchClear.style.display = posRecipeIngSearchQuery ? 'block' : 'none';
                }
                populateIngredientSelect();
            });

            posIngSearchClear?.addEventListener('click', () => {
                posIngSearchInput.value = '';
                posRecipeIngSearchQuery = '';
                posIngSearchClear.style.display = 'none';
                populateIngredientSelect();
                posIngSearchInput.focus();
            });

            posIngSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const quickSelect = document.getElementById('pos-quick-add-ingredient');
                    if (quickSelect && quickSelect.options.length > 1) {
                        quickSelect.selectedIndex = 1;
                        quickSelect.dispatchEvent(new Event('change'));
                        document.getElementById('pos-quick-add-qty')?.focus();
                    }
                }
            });
        }

        // Warehouse chip filter buttons in POS Recipe Modal
        document.querySelectorAll('.btn-pos-rec-wh-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-pos-rec-wh-chip').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = '#ffffff';
                    b.style.color = '#334155';
                });
                btn.classList.add('active');
                posRecipeWhFilter = btn.dataset.wh;
                if (posRecipeWhFilter === 'all') {
                    btn.style.background = '#0f172a';
                    btn.style.color = '#ffffff';
                } else if (posRecipeWhFilter === 'fresh') {
                    btn.style.background = '#16a34a';
                    btn.style.color = '#ffffff';
                } else if (posRecipeWhFilter === 'dry') {
                    btn.style.background = '#d97706';
                    btn.style.color = '#ffffff';
                } else if (posRecipeWhFilter === 'beverage') {
                    btn.style.background = '#2563eb';
                    btn.style.color = '#ffffff';
                }
                populateIngredientSelect();
            });
        });

        // Event Listeners cho POS Quick Add Bar
        document.getElementById('pos-quick-add-ingredient')?.addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            if (opt && opt.dataset.unit) {
                const sUnit = opt.dataset.unit.toLowerCase();
                const ingName = (opt.dataset.name || '').toLowerCase();

                if (ingName.includes('phồng tôm') || ingName.includes('phong tom') || ingName.includes('phongtom')) {
                    document.getElementById('pos-quick-add-unit').value = 'cái';
                    document.getElementById('pos-quick-add-qty').value = '10';
                } else if (['kg', 'kilogram'].includes(sUnit)) {
                    document.getElementById('pos-quick-add-unit').value = 'g';
                    document.getElementById('pos-quick-add-qty').value = '100';
                } else if (['l', 'lít', 'lit'].includes(sUnit)) {
                    document.getElementById('pos-quick-add-unit').value = 'ml';
                    document.getElementById('pos-quick-add-qty').value = '50';
                } else {
                    document.getElementById('pos-quick-add-unit').value = opt.dataset.unit;
                    document.getElementById('pos-quick-add-qty').value = '1';
                }
            }
            updatePosQuickAddPreview();
        });

        document.getElementById('pos-quick-add-qty')?.addEventListener('input', updatePosQuickAddPreview);
        document.getElementById('pos-quick-add-unit')?.addEventListener('input', updatePosQuickAddPreview);

        document.querySelectorAll('.btn-pos-quick-unit').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('pos-quick-add-unit').value = btn.dataset.unit;
                updatePosQuickAddPreview();
            });
        });

        document.getElementById('pos-quick-add-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedProductId) {
                showAlert('Vui lòng chọn một món ăn trước.', 'error');
                return;
            }
            const ingId = document.getElementById('pos-quick-add-ingredient').value;
            const qty = document.getElementById('pos-quick-add-qty').value;
            const unit = document.getElementById('pos-quick-add-unit').value.trim();

            if (!ingId) { showAlert('Vui lòng chọn nguyên liệu.', 'error'); return; }

            try {
                const resp = await fetch('/inventory/recipes/api/save-item/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify({
                        product_id: selectedProductId,
                        ingredient_id: ingId,
                        quantity: qty,
                        unit: unit,
                    }),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi lưu nguyên liệu.');

                showAlert(res.message);
                document.getElementById('pos-quick-add-ingredient').value = '';
                document.getElementById('pos-quick-add-cost-preview').textContent = '0 đ';
                if (document.getElementById('pos-quick-add-calc-hint')) {
                    document.getElementById('pos-quick-add-calc-hint').hidden = true;
                }
                await loadRecipeData(false);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        document.getElementById('pos-form-recipe-item')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ingId = document.getElementById('pos-recipe-item-ingredient').value;
            const qty = document.getElementById('pos-recipe-item-qty').value;
            const unit = document.getElementById('pos-recipe-item-unit').value.trim();

            try {
                const resp = await fetch('/inventory/recipes/api/save-item/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify({
                        product_id: selectedProductId,
                        ingredient_id: ingId,
                        quantity: qty,
                        unit: unit,
                    }),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi lưu nguyên liệu.');

                if (submodalItem) submodalItem.hidden = true;
                showAlert(res.message);
                await loadRecipeData(false);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Clear recipe
        document.getElementById('modal-pos-btn-clear-recipe')?.addEventListener('click', async () => {
            if (!selectedProductId) return;
            if (!confirm(`Bạn có chắc muốn xóa toàn bộ công thức định lượng của món "${selectedRecipe?.product_name}"?`)) return;

            try {
                const resp = await fetch(`/inventory/recipes/api/delete-recipe/${selectedProductId}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa.');

                showAlert(res.message);
                await loadRecipeData(false);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Excel Import
        document.getElementById('modal-pos-btn-recipe-excel-import')?.addEventListener('click', () => {
            if (submodalExcel) submodalExcel.hidden = false;
        });
        document.getElementById('pos-submodal-recipe-excel-close')?.addEventListener('click', () => { if (submodalExcel) submodalExcel.hidden = true; });
        document.getElementById('pos-submodal-recipe-excel-cancel')?.addEventListener('click', () => { if (submodalExcel) submodalExcel.hidden = true; });

        document.getElementById('pos-form-recipe-excel')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('pos-recipe-excel-file');
            const textInput = document.getElementById('pos-recipe-excel-text');
            const formData = new FormData();

            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            } else if (textInput.value.trim()) {
                formData.append('csv_text', textInput.value.trim());
            } else {
                showAlert('Vui lòng chọn file hoặc dán dữ liệu công thức.', 'error');
                return;
            }

            const btnSubmit = document.getElementById('pos-btn-submit-recipe-excel');
            if (btnSubmit) btnSubmit.disabled = true;

            try {
                const resp = await fetch('/inventory/recipes/import/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                    body: formData,
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');

                showAlert(res.message);
                if (submodalExcel) submodalExcel.hidden = true;
                fileInput.value = '';
                textInput.value = '';
                await loadRecipeData(false);
            } catch (err) {
                showAlert(err.message, 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        });
    })();
