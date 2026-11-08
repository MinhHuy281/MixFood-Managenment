// # File này chịu trách nhiệm xử lý giao diện trang Định lượng Nguyên liệu (BOM Recipes): lọc món, lọc nguyên liệu theo 3 kho, sắp xếp A-Z, tính giá vốn tự động và lưu công thức món.
(function() {
    const csrfToken = () => {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    };

    let selectedProductId = null;
    let productsData = [];
    let ingredientsData = [];
    let selectedRecipe = null;

    const alertBanner = document.getElementById('page-recipe-alert');
    const dishSearch = document.getElementById('page-recipe-dish-search');
    const catFilter = document.getElementById('page-recipe-cat-filter');
    const dishList = document.getElementById('page-recipe-dish-list');
    const dishesCountSpan = document.getElementById('page-recipe-dishes-count');

    const noSelectionBox = document.getElementById('page-recipe-no-selection');
    const selectionWrap = document.getElementById('page-recipe-selection-wrap');

    const submodalItem = document.getElementById('page-submodal-recipe-item');
    const submodalCopy = document.getElementById('page-submodal-copy-recipe');
    const submodalExcel = document.getElementById('page-submodal-recipe-excel');

    function showAlert(msg, type = 'success') {
        if (!alertBanner) return;
        alertBanner.textContent = msg;
        alertBanner.className = `menu-alert-banner alert-${type}`;
        alertBanner.hidden = false;
        setTimeout(() => { alertBanner.hidden = true; }, 4000);
    }

    // Engine quy đổi đơn vị trên Frontend cho tính toán chi phí tức thì
    function convertRecipeToStockQty(ingName, stockUnit, qty, recipeUnit, packSize = 1) {
        if (!qty || isNaN(qty)) return { stockQty: 0, hint: '' };
        const q = Number(qty);
        const pSize = Number(packSize) > 0 ? Number(packSize) : 1;
        const rUnit = (recipeUnit || '').trim().toLowerCase();
        const sUnit = (stockUnit || '').trim().toLowerCase();
        const name = (ingName || '').toLowerCase();
        const isBulkPack = ['thùng', 'thung', 'vỉ', 'vi', 'bao', 'két', 'ket'].includes(sUnit) && pSize > 1;
        const divBulk = (val) => isBulkPack ? (val / pSize) : val;

        // Bánh phồng tôm (1 hộp = 100 cái bánh = 10 phần)
        if (name.includes('phồng tôm') || name.includes('phong tom') || name.includes('phongtom')) {
            if (['cái', 'cai', 'bánh', 'banh', 'miếng', 'mieng'].some(k => rUnit.includes(k))) {
                return { stockQty: q / 100, hint: `Quy đổi: ${q} cái bánh phồng = ${(q / 100).toFixed(2)} hộp (1 hộp = 10 phần = 100 cái)` };
            } else if (['phần', 'phan', 'dĩa', 'dia'].some(k => rUnit.includes(k))) {
                return { stockQty: q * 0.1, hint: `Quy đổi: ${q} phần = ${(q * 10)} cái = ${(q * 0.1).toFixed(2)} hộp` };
            }
        }

        // Trứng gà (1 Vỉ = 30 quả)
        if (name.includes('trứng') || name.includes('trung')) {
            if (['quả', 'qua', 'trái', 'trai'].includes(rUnit)) {
                return { stockQty: divBulk(q), hint: `Quy đổi: ${q} quả trứng (1 vỉ = 30 quả)` };
            }
        }

        // Sữa đặc Ông Thọ (Hộp 380g)
        if (name.includes('sữa đặc') || name.includes('sua dac')) {
            if (['g', 'gram', 'gr', 'gam', 'ml'].includes(rUnit)) {
                return { stockQty: divBulk(q / 380), hint: `Quy đổi: ${q} ${rUnit} = ${(q / 380).toFixed(3)} hộp sữa đặc (380g/hộp)` };
            }
            if (['thìa', 'muỗng', 'muong', 'thia'].includes(rUnit)) {
                return { stockQty: divBulk((q * 15) / 380), hint: `Quy đổi: ${q} thìa sữa = ${((q * 15) / 380).toFixed(3)} hộp` };
            }
        }

        // Sữa tươi không đường (Hộp 1000ml)
        if (name.includes('sữa tươi') || name.includes('sua tuoi')) {
            if (['ml', 'mililit', 'cc'].includes(rUnit)) {
                return { stockQty: divBulk(q / 1000), hint: `Quy đổi: ${q} ml = ${(q / 1000).toFixed(3)} hộp sữa tươi (1L/hộp)` };
            }
        }

        // Trà Thái đỏ / Trà Thái xanh / Trà túi lọc (Gói 400g)
        if (name.includes('trà thái') || name.includes('tra thai') || name.includes('túi lọc') || name.includes('tui loc')) {
            if (['g', 'gram', 'gr', 'gam'].includes(rUnit)) {
                return { stockQty: divBulk(q / 400), hint: `Quy đổi: ${q} g cốt trà = ${(q / 400).toFixed(3)} gói (400g/gói)` };
            }
            if (['túi', 'tui'].includes(rUnit)) {
                return { stockQty: divBulk(q / 50), hint: `Quy đổi: ${q} túi lọc = ${(q / 50).toFixed(3)} gói trà (50 túi/gói)` };
            }
        }

        // Tương ớt Cholimex (Hộp/Chai 270g)
        if (name.includes('tương ớt') || name.includes('tuong ot')) {
            if (['g', 'gram', 'gr', 'gam', 'ml'].includes(rUnit)) {
                return { stockQty: divBulk(q / 270), hint: `Quy đổi: ${q} g tương ớt = ${(q / 270).toFixed(3)} hộp (270g/hộp)` };
            }
        }

        // Sốt Mayonnaise Kewpie (Hộp/Chai 300g)
        if (name.includes('mayonnaise') || name.includes('kewpie')) {
            if (['g', 'gram', 'gr', 'gam', 'ml'].includes(rUnit)) {
                return { stockQty: divBulk(q / 300), hint: `Quy đổi: ${q} g sốt Mayonnaise = ${(q / 300).toFixed(3)} hộp (300g/hộp)` };
            }
        }

        // Dầu ăn Neptune Gold 5L (Hộp/Can 5000ml)
        if (name.includes('dầu ăn') || name.includes('dau an')) {
            if (['ml', 'mililit', 'cc'].includes(rUnit)) {
                return { stockQty: divBulk(q / 5000), hint: `Quy đổi: ${q} ml dầu ăn = ${(q / 5000).toFixed(4)} hộp (can 5L)` };
            }
        }

        // Nước cốt dừa (Hộp/Lít 1000ml)
        if (name.includes('cốt dừa') || name.includes('cot dua')) {
            if (['ml', 'mililit', 'cc'].includes(rUnit)) {
                return { stockQty: divBulk(q / 1000), hint: `Quy đổi: ${q} ml cốt dừa = ${(q / 1000).toFixed(3)} hộp (1L)` };
            }
        }

        // Cơm -> Gạo (1 chén = 100g = 0.1 kg)
        if (['chén', 'chen', 'bát', 'bat', 'phần', 'phan', 'dĩa', 'dia'].some(k => rUnit.includes(k)) && (name.includes('gạo') || name.includes('gao'))) {
            return { stockQty: divBulk(q * 0.1), hint: `Quy đổi gián tiếp: ${q} chén cơm = ${(q * 0.1).toFixed(3)} kg Gạo` };
        }
        // Xôi -> Nếp (1 phần xôi = 100g = 0.1 kg)
        if (['phần', 'phan', 'chén', 'chen'].some(k => rUnit.includes(k)) && (name.includes('nếp') || name.includes('nep'))) {
            return { stockQty: divBulk(q * 0.1), hint: `Quy đổi gián tiếp: ${q} phần xôi = ${(q * 0.1).toFixed(3)} kg Nếp` };
        }
        // Cá nguyên con -> 0.8 kg
        if (rUnit.includes('con') && (name.includes('cá') || name.includes('ca'))) {
            return { stockQty: divBulk(q * 0.8), hint: `Quy đổi cá nguyên con: ${q} con cá ~ ${(q * 0.8).toFixed(3)} kg` };
        }
        // g -> kg / hộp 1kg
        if (['g', 'gram', 'gr', 'gam'].includes(rUnit)) {
            return { stockQty: divBulk(q / 1000), hint: `Quy đổi chuẩn: ${q} g = ${(q / 1000).toFixed(3)} kg (hộp)` };
        }
        // ml -> Lít / hộp 1L
        if (['ml', 'mililit', 'cc'].includes(rUnit)) {
            return { stockQty: divBulk(q / 1000), hint: `Quy đổi chuẩn: ${q} ml = ${(q / 1000).toFixed(3)} Lít (hộp)` };
        }
        return { stockQty: divBulk(q), hint: isBulkPack ? `Quy đổi theo thùng/vỉ (1 ${stockUnit} = ${pSize} ĐVT lẻ)` : '' };
    }

    async function loadRecipeData(selectFirstIfNone = false) {
        const q = dishSearch.value.trim();
        const catId = catFilter.value;
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (catId) params.set('category_id', catId);
        if (selectedProductId) params.set('product_id', selectedProductId);

        try {
            const resp = await fetch(`/inventory/recipes/api/data/?${params.toString()}`);
            const data = await resp.json();
            productsData = data.products || [];
            ingredientsData = data.ingredients || [];
            selectedRecipe = data.selected_recipe || null;

            renderDishList();
            populateIngredientSelects();
            populateCopyProductSelect();

            // Kiểm tra xem URL có truyền product_id không
            const urlParams = new URLSearchParams(window.location.search);
            const urlProductId = urlParams.get('product_id');
            if (urlProductId && !selectedProductId) {
                selectedProductId = Number(urlProductId);
                await loadRecipeData(false);
                return;
            }

            if (selectedProductId && selectedRecipe) {
                renderRecipeDetails();
            } else if (selectFirstIfNone && productsData.length > 0) {
                selectedProductId = productsData[0].id;
                await loadRecipeData(false);
            } else {
                noSelectionBox.hidden = false;
                selectionWrap.hidden = true;
            }
        } catch (err) {
            console.error(err);
        }
    }

    function renderDishList() {
        dishesCountSpan.textContent = `${productsData.length} món`;
        if (productsData.length === 0) {
            dishList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 13px;">Không tìm thấy món ăn nào.</div>';
            return;
        }

        dishList.innerHTML = productsData.map(p => `
            <div class="recipe-dish-item ${selectedProductId === p.id ? 'active' : ''}" data-id="${p.id}" style="padding: 10px 12px; margin-bottom: 6px; border-radius: 8px; border: 1px solid ${selectedProductId === p.id ? '#0284c7' : '#e2e8f0'}; background: ${selectedProductId === p.id ? '#f0f9ff' : '#fff'}; cursor: pointer; transition: all 0.15s ease;">
                <div class="dish-item-top" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                    <strong class="dish-item-name" style="font-size: 13.5px; color: ${selectedProductId === p.id ? '#0369a1' : '#0f172a'};">${p.name}</strong>
                    <span class="dish-item-badge ${p.has_recipe ? 'badge-has-recipe' : 'badge-no-recipe'}" style="font-size: 11px; padding: 2px 7px; border-radius: 12px; font-weight: 700; background: ${p.has_recipe ? '#dcfce7' : '#fef3c7'}; color: ${p.has_recipe ? '#15803d' : '#b45309'};">
                        ${p.has_recipe ? `${p.items_count} NL` : 'Chưa định lượng'}
                    </span>
                </div>
                <div class="dish-item-bottom" style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                    <span class="dish-item-code" style="color: #64748b; font-family: monospace;">${p.code} (${p.unit})</span>
                    <div class="dish-item-prices">
                        <strong class="dish-price" style="color: #0284c7;">${p.price_formatted} đ</strong>
                        ${p.has_recipe ? `<span class="dish-cost" style="color: #d97706; margin-left: 6px; font-size: 11.5px;">Vốn: ${p.cost_price_formatted} đ</span>` : ''}
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
    }

    function renderRecipeDetails() {
        if (!selectedRecipe) return;

        noSelectionBox.hidden = true;
        selectionWrap.hidden = false;

        document.getElementById('page-recipe-dish-name').textContent = selectedRecipe.product_name;
        document.getElementById('page-recipe-dish-code').textContent = `${selectedRecipe.product_code} (${selectedRecipe.product_unit})`;
        document.getElementById('page-recipe-cat-badge').textContent = selectedRecipe.category_name;

        document.getElementById('page-recipe-price').textContent = `${selectedRecipe.price_formatted} đ`;
        document.getElementById('page-recipe-cost').textContent = `${selectedRecipe.total_cost_formatted} đ`;
        document.getElementById('page-recipe-profit').textContent = `${selectedRecipe.profit_formatted} đ`;

        const marginEl = document.getElementById('page-recipe-margin');
        marginEl.textContent = `${selectedRecipe.margin_pct}%`;
        if (selectedRecipe.margin_pct >= 50) {
            marginEl.style.color = '#16a34a';
        } else if (selectedRecipe.margin_pct >= 30) {
            marginEl.style.color = '#d97706';
        } else {
            marginEl.style.color = '#dc2626';
        }

        const items = selectedRecipe.items || [];
        document.getElementById('page-recipe-items-count').textContent = `${items.length} nguyên liệu cấu thành`;

        // Toggle Empty Recipe Banner
        const emptyCta = document.getElementById('page-recipe-empty-cta');
        if (items.length === 0) {
            emptyCta.hidden = false;
        } else {
            emptyCta.hidden = true;
        }

        const tbody = document.getElementById('page-recipe-items-tbody');
        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px 20px; color: #94a3b8; font-size: 13.5px;">
                        Món này chưa có nguyên liệu nào trong công thức.<br>
                        Sử dụng thanh <strong>"Thêm định lượng nguyên liệu vào món"</strong> ở trên để thêm nguyên liệu đầu tiên!
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = items.map((it, idx) => `
            <tr data-id="${it.item_id}">
                <td style="text-align: center; color: #94a3b8; font-size: 12px;">${idx + 1}</td>
                <td><span class="badge-cat" style="font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${it.ingredient_group || 'Chung'}</span></td>
                <td>
                    <strong style="color: #0f172a; font-size: 13.5px;">${it.ingredient_name}</strong>
                    <span style="font-size: 11px; color: #64748b; margin-left: 4px; font-family: monospace;">(${it.ingredient_code})</span>
                </td>
                <td style="text-align: right; font-weight: 800; color: #0284c7; font-size: 14px;">${it.quantity_formatted}</td>
                <td style="text-align: center;"><span style="background: #f1f5f9; padding: 2px 7px; border-radius: 4px; font-size: 12px; font-weight: 700;">${it.unit}</span></td>
                <td style="text-align: right; color: #64748b; font-size: 13px;">${it.unit_cost_formatted} đ</td>
                <td style="text-align: right; font-weight: 800; color: #d97706; font-size: 14px;">${it.total_cost_formatted} đ</td>
                <td style="text-align: center;">
                    <div style="display: inline-flex; gap: 4px;">
                        <button type="button" class="btn-row-action btn-edit-recipe-item" data-id="${it.item_id}" data-ing-id="${it.ingredient_id}" data-qty="${it.quantity}" data-unit="${it.unit}" title="Sửa định lượng" style="border: 1px solid #cbd5e1; background: #fff; border-radius: 4px; padding: 3px 6px; cursor: pointer; font-size: 12px;">
                            ✏️
                        </button>
                        <button type="button" class="btn-row-action btn-del-recipe-item text-danger" data-id="${it.item_id}" title="Xóa nguyên liệu" style="border: 1px solid #fee2e2; background: #fef2f2; border-radius: 4px; padding: 3px 6px; cursor: pointer; color: #dc2626; font-size: 12px;">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Bind Delete item
        tbody.querySelectorAll('.btn-del-recipe-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.id;
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

        // Bind Edit item
        tbody.querySelectorAll('.btn-edit-recipe-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ingId = btn.dataset.ingId;
                const qty = btn.dataset.qty;
                const unit = btn.dataset.unit;

                document.getElementById('submodal-recipe-item-title').textContent = 'Chỉnh sửa định lượng nguyên liệu';
                const ingSelect = document.getElementById('page-recipe-item-ingredient');
                ingSelect.value = ingId;
                document.getElementById('page-recipe-item-qty').value = qty;
                document.getElementById('page-recipe-item-unit').value = unit;
                updateCostPreview();
                submodalItem.hidden = false;
            });
        });
    }

    let selectedRecWarehouse = 'all';
    let currentQuickIngQuery = '';

    // Hàm chuẩn hóa tiếng Việt không dấu phục vụ tìm kiếm thông minh
    function removeVietnameseTones(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
        str = str.replace(/đ/g, 'd');
        str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, '');
        str = str.replace(/\u02C6|\u0306|\u031B/g, '');
        return str.trim();
    }

    function populateIngredientSelects() {
        const ingSelect = document.getElementById('page-recipe-item-ingredient');
        const quickSelect = document.getElementById('quick-add-ingredient');
        const matchCountEl = document.getElementById('quick-add-ing-match-count');

        // 1. Lọc theo Kho
        let filtered = (selectedRecWarehouse && selectedRecWarehouse !== 'all')
            ? ingredientsData.filter(i => i.storage_area === selectedRecWarehouse)
            : ingredientsData.slice();

        // 2. Lọc theo từ khóa tìm kiếm (hỗ trợ có dấu và không dấu, mã, tên, nhóm)
        const qRaw = currentQuickIngQuery.trim().toLowerCase();
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

        // Cập nhật nhãn đếm kết quả
        if (matchCountEl) {
            if (qRaw) {
                matchCountEl.hidden = false;
                matchCountEl.textContent = `${filtered.length} kết quả khớp`;
            } else {
                matchCountEl.hidden = true;
            }
        }

        // 3. SẮP XẾP ALPHABET A-Z TIẾNG VIỆT
        const sortVietnamese = (a, b) => (a.name || '').localeCompare((b.name || ''), 'vi', { sensitivity: 'base' });

        const freshList = filtered.filter(i => i.storage_area === 'fresh').sort(sortVietnamese);
        const dryList = filtered.filter(i => i.storage_area === 'dry').sort(sortVietnamese);
        const bevList = filtered.filter(i => i.storage_area === 'beverage').sort(sortVietnamese);

        let optionsHtml = '<option value="">-- Chọn nguyên liệu từ kho --</option>';
        if (freshList.length) {
            optionsHtml += `<optgroup label="🥦 Kho 1: Sản phẩm tươi sống & Rau củ quả (${freshList.length})">`;
            freshList.forEach(ing => {
                optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-pack="${ing.pack_size || 1}" data-name="${ing.name}">
                    [Kho 1] ${ing.name} (${ing.unit} - ${ing.cost_formatted} đ)
                </option>`;
            });
            optionsHtml += '</optgroup>';
        }
        if (dryList.length) {
            optionsHtml += `<optgroup label="🥫 Kho 2: Nguyên liệu khô, Gia vị & Bao bì (${dryList.length})">`;
            dryList.forEach(ing => {
                optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-pack="${ing.pack_size || 1}" data-name="${ing.name}">
                    [Kho 2] ${ing.name} (${ing.unit} - ${ing.cost_formatted} đ)
                </option>`;
            });
            optionsHtml += '</optgroup>';
        }
        if (bevList.length) {
            optionsHtml += `<optgroup label="🍹 Kho 3: Đồ uống & Trái cây (${bevList.length})">`;
            bevList.forEach(ing => {
                optionsHtml += `<option value="${ing.id}" data-cost="${ing.average_cost}" data-unit="${ing.unit}" data-pack="${ing.pack_size || 1}" data-name="${ing.name}">
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
                // Tự động chọn nếu chỉ có duy nhất 1 kết quả khớp
                quickSelect.value = filtered[0].id;
                quickSelect.dispatchEvent(new Event('change'));
            }
        }
    }

    function populateCopyProductSelect() {
        const select = document.getElementById('copy-from-product-select');
        if (!select) return;
        const eligible = productsData.filter(p => p.has_recipe && p.id !== selectedProductId);
        select.innerHTML = '<option value="">-- Chọn món đã có công thức --</option>' +
            eligible.map(p => `
                <option value="${p.id}" data-count="${p.items_count}" data-cost="${p.cost_price_formatted}">
                    ${p.name} (${p.code}) - ${p.items_count} nguyên liệu [Vốn: ${p.cost_price_formatted} đ]
                </option>
            `).join('');
    }

    // Preview tính toán cho Submodal
    function updateCostPreview() {
        const ingSelect = document.getElementById('page-recipe-item-ingredient');
        const qtyInput = document.getElementById('page-recipe-item-qty');
        const unitInput = document.getElementById('page-recipe-item-unit');
        const stockUnitEl = document.getElementById('page-recipe-preview-stock-unit');
        const unitCostEl = document.getElementById('page-recipe-preview-unit-cost');
        const totalCostEl = document.getElementById('page-recipe-preview-total-cost');
        const hintEl = document.getElementById('page-recipe-modal-calc-hint');

        const opt = ingSelect.selectedOptions[0];
        if (!opt || !opt.dataset.cost) {
            stockUnitEl.textContent = '-';
            unitCostEl.textContent = '0 đ';
            totalCostEl.textContent = '0 đ';
            hintEl.hidden = true;
            return;
        }

        const cost = Number(opt.dataset.cost) || 0;
        const stockUnit = opt.dataset.unit || '';
        const ingName = opt.dataset.name || '';
        const qty = Number(qtyInput.value) || 0;
        const unit = unitInput.value.trim() || stockUnit;

        stockUnitEl.textContent = stockUnit;
        unitCostEl.textContent = `${cost.toLocaleString('vi-VN')} đ / ${stockUnit}`;

        const conv = convertRecipeToStockQty(ingName, stockUnit, qty, unit, opt.dataset.pack || 1);
        const total = conv.stockQty * cost;

        totalCostEl.textContent = `${Math.round(total).toLocaleString('vi-VN')} đ`;
        if (conv.hint) {
            hintEl.textContent = `⚡ ${conv.hint}`;
            hintEl.hidden = false;
        } else {
            hintEl.hidden = true;
        }
    }

    // Preview tính toán cho Quick Add Bar
    function updateQuickAddPreview() {
        const quickSelect = document.getElementById('quick-add-ingredient');
        const qtyInput = document.getElementById('quick-add-qty');
        const unitInput = document.getElementById('quick-add-unit');
        const previewEl = document.getElementById('quick-add-cost-preview');
        const hintEl = document.getElementById('quick-add-calc-hint');

        const opt = quickSelect.selectedOptions[0];
        if (!opt || !opt.dataset.cost) {
            previewEl.textContent = '0 đ';
            hintEl.hidden = true;
            return;
        }

        const cost = Number(opt.dataset.cost) || 0;
        const stockUnit = opt.dataset.unit || '';
        const ingName = opt.dataset.name || '';
        const qty = Number(qtyInput.value) || 0;
        const unit = unitInput.value.trim() || stockUnit;

        const conv = convertRecipeToStockQty(ingName, stockUnit, qty, unit, opt.dataset.pack || 1);
        const total = conv.stockQty * cost;

        previewEl.textContent = `${Math.round(total).toLocaleString('vi-VN')} đ`;
        if (conv.hint) {
            hintEl.innerHTML = `<span>⚡</span> <span>${conv.hint} | Thành tiền vốn: <strong>${Math.round(total).toLocaleString('vi-VN')} đ</strong></span>`;
            hintEl.hidden = false;
        } else {
            hintEl.innerHTML = `<span>💰</span> <span>Đơn vị gốc: <strong>${stockUnit}</strong> (${cost.toLocaleString('vi-VN')} đ/${stockUnit}) | Thành tiền vốn: <strong>${Math.round(total).toLocaleString('vi-VN')} đ</strong></span>`;
            hintEl.hidden = false;
        }
    }

    // Event Listeners cho tìm kiếm và bộ lọc
    dishSearch?.addEventListener('input', () => { loadRecipeData(false); });
    catFilter?.addEventListener('change', () => { loadRecipeData(false); });

    // Event Listeners cho bộ lọc 3 Kho
    document.querySelectorAll('.btn-rec-wh-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-rec-wh-chip').forEach(b => {
                b.classList.remove('active');
                b.style.background = '#ffffff';
                b.style.color = '#334155';
            });
            btn.classList.add('active');
            selectedRecWarehouse = btn.dataset.wh;
            if (selectedRecWarehouse === 'all') {
                btn.style.background = '#0f172a';
                btn.style.color = '#ffffff';
            } else if (selectedRecWarehouse === 'fresh') {
                btn.style.background = '#16a34a';
                btn.style.color = '#ffffff';
            } else if (selectedRecWarehouse === 'dry') {
                btn.style.background = '#d97706';
                btn.style.color = '#ffffff';
            } else if (selectedRecWarehouse === 'beverage') {
                btn.style.background = '#2563eb';
                btn.style.color = '#ffffff';
            }
            populateIngredientSelects();
        });
    });

    // Event Listeners cho ô Tìm kiếm Nguyên liệu nhanh
    const ingSearchInput = document.getElementById('quick-add-ing-search');
    const ingSearchClear = document.getElementById('quick-add-ing-search-clear');

    if (ingSearchInput) {
        ingSearchInput.addEventListener('input', (e) => {
            currentQuickIngQuery = e.target.value;
            if (ingSearchClear) {
                ingSearchClear.style.display = currentQuickIngQuery ? 'block' : 'none';
            }
            populateIngredientSelects();
        });

        ingSearchClear?.addEventListener('click', () => {
            ingSearchInput.value = '';
            currentQuickIngQuery = '';
            ingSearchClear.style.display = 'none';
            populateIngredientSelects();
            ingSearchInput.focus();
        });

        // Nhấn phím Enter trong ô tìm kiếm
        ingSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const quickSelect = document.getElementById('quick-add-ingredient');
                if (quickSelect && quickSelect.options.length > 1) {
                    quickSelect.selectedIndex = 1;
                    quickSelect.dispatchEvent(new Event('change'));
                    document.getElementById('quick-add-qty')?.focus();
                }
            }
        });
    }

    // Event Listeners cho Quick Add Bar
    document.getElementById('quick-add-ingredient')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt && opt.dataset.unit) {
            const sUnit = opt.dataset.unit.toLowerCase();
            const ingName = (opt.dataset.name || '').toLowerCase();

            // Nhận diện Bánh phồng tôm tự động set 10 cái
            if (ingName.includes('phồng tôm') || ingName.includes('phong tom') || ingName.includes('phongtom')) {
                document.getElementById('quick-add-unit').value = 'cái';
                document.getElementById('quick-add-qty').value = '10';
            } else if (['kg', 'kilogram'].includes(sUnit)) {
                document.getElementById('quick-add-unit').value = 'g';
                document.getElementById('quick-add-qty').value = '100';
            } else if (['l', 'lít', 'lit'].includes(sUnit)) {
                document.getElementById('quick-add-unit').value = 'ml';
                document.getElementById('quick-add-qty').value = '50';
            } else {
                document.getElementById('quick-add-unit').value = opt.dataset.unit;
                document.getElementById('quick-add-qty').value = '1';
            }
        }
        updateQuickAddPreview();
    });

    document.getElementById('quick-add-qty')?.addEventListener('input', updateQuickAddPreview);
    document.getElementById('quick-add-unit')?.addEventListener('input', updateQuickAddPreview);

    // Quick Increment Chips
    document.querySelectorAll('.btn-qty-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const delta = Number(btn.dataset.delta) || 0;
            const cur = Number(document.getElementById('quick-add-qty').value) || 0;
            document.getElementById('quick-add-qty').value = cur + delta;
            updateQuickAddPreview();
        });
    });

    // Quick Unit Pills
    document.querySelectorAll('.btn-unit-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('quick-add-unit').value = btn.dataset.unit;
            updateQuickAddPreview();
        });
    });

    // Submit Quick Add Form
    document.getElementById('page-quick-add-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedProductId) {
            showAlert('Vui lòng chọn một món ăn trước.', 'error');
            return;
        }
        const ingId = document.getElementById('quick-add-ingredient').value;
        const qty = document.getElementById('quick-add-qty').value;
        const unit = document.getElementById('quick-add-unit').value.trim();

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
            document.getElementById('quick-add-ingredient').value = '';
            document.getElementById('quick-add-cost-preview').textContent = '0 đ';
            document.getElementById('quick-add-calc-hint').hidden = true;
            await loadRecipeData(false);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Mở Form chi tiết
    const openDetailedModal = () => {
        if (!selectedProductId) return;
        document.getElementById('submodal-recipe-item-title').textContent = 'Thêm nguyên liệu vào món';
        const ingSelect = document.getElementById('page-recipe-item-ingredient');
        ingSelect.value = '';
        document.getElementById('page-recipe-item-qty').value = '100';
        document.getElementById('page-recipe-item-unit').value = 'g';
        updateCostPreview();
        submodalItem.hidden = false;
    };
    document.getElementById('btn-trigger-detailed-modal')?.addEventListener('click', openDetailedModal);

    document.getElementById('page-submodal-recipe-item-close')?.addEventListener('click', () => { submodalItem.hidden = true; });
    document.getElementById('page-submodal-recipe-item-cancel')?.addEventListener('click', () => { submodalItem.hidden = true; });

    document.getElementById('page-recipe-item-ingredient')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        if (opt && opt.dataset.unit) {
            const sUnit = opt.dataset.unit.toLowerCase();
            if (['kg', 'kilogram'].includes(sUnit)) {
                document.getElementById('page-recipe-item-unit').value = 'g';
                document.getElementById('page-recipe-item-qty').value = '100';
            } else if (['l', 'lít', 'lit'].includes(sUnit)) {
                document.getElementById('page-recipe-item-unit').value = 'ml';
                document.getElementById('page-recipe-item-qty').value = '50';
            } else {
                document.getElementById('page-recipe-item-unit').value = opt.dataset.unit;
                document.getElementById('page-recipe-item-qty').value = '1';
            }
        }
        updateCostPreview();
    });
    document.getElementById('page-recipe-item-qty')?.addEventListener('input', updateCostPreview);
    document.getElementById('page-recipe-item-unit')?.addEventListener('input', updateCostPreview);

    document.querySelectorAll('.btn-modal-unit-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('page-recipe-item-unit').value = btn.dataset.unit;
            updateCostPreview();
        });
    });

    document.getElementById('page-form-recipe-item')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ingId = document.getElementById('page-recipe-item-ingredient').value;
        const qty = document.getElementById('page-recipe-item-qty').value;
        const unit = document.getElementById('page-recipe-item-unit').value.trim();

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

            submodalItem.hidden = true;
            showAlert(res.message);
            await loadRecipeData(false);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Mở Copy Recipe Modal
    document.querySelectorAll('.btn-copy-recipe-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!selectedProductId || !selectedRecipe) {
                showAlert('Vui lòng chọn món cần sao chép định lượng.', 'error');
                return;
            }
            document.getElementById('copy-target-dish-name').textContent = `"${selectedRecipe.product_name}"`;
            populateCopyProductSelect();
            document.getElementById('copy-preview-box').hidden = true;
            submodalCopy.hidden = false;
        });
    });

    document.getElementById('copy-from-product-select')?.addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        const preview = document.getElementById('copy-preview-box');
        if (opt && opt.value) {
            document.getElementById('copy-preview-count').textContent = `${opt.dataset.count} nguyên liệu`;
            document.getElementById('copy-preview-cost').textContent = `${opt.dataset.cost} đ`;
            preview.hidden = false;
        } else {
            preview.hidden = true;
        }
    });

    document.getElementById('page-submodal-copy-close')?.addEventListener('click', () => { submodalCopy.hidden = true; });
    document.getElementById('page-submodal-copy-cancel')?.addEventListener('click', () => { submodalCopy.hidden = true; });

    document.getElementById('page-form-copy-recipe')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fromId = document.getElementById('copy-from-product-select').value;
        if (!fromId) { showAlert('Vui lòng chọn món nguồn.', 'error'); return; }

        try {
            const resp = await fetch('/inventory/recipes/api/copy-recipe/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                body: JSON.stringify({
                    from_product_id: fromId,
                    to_product_id: selectedProductId,
                }),
            });
            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Lỗi khi sao chép.');

            submodalCopy.hidden = true;
            showAlert(res.message);
            await loadRecipeData(false);
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Xóa toàn bộ công thức
    document.getElementById('page-btn-clear-recipe')?.addEventListener('click', async () => {
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
    document.getElementById('page-btn-recipe-excel-import')?.addEventListener('click', () => {
        submodalExcel.hidden = false;
    });
    document.getElementById('page-submodal-recipe-excel-close')?.addEventListener('click', () => { submodalExcel.hidden = true; });
    document.getElementById('page-submodal-recipe-excel-cancel')?.addEventListener('click', () => { submodalExcel.hidden = true; });

    document.getElementById('page-form-recipe-excel')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('page-recipe-excel-file');
        const textInput = document.getElementById('page-recipe-excel-text');
        const btnSubmit = document.getElementById('page-btn-submit-recipe-excel');

        const formData = new FormData();
        if (fileInput.files.length > 0) {
            formData.append('excel_file', fileInput.files[0]);
        }
        formData.append('pasted_text', textInput.value);

        try {
            if (btnSubmit) btnSubmit.disabled = true;
            const resp = await fetch('/inventory/recipes/import/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken() },
                body: formData,
            });
            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');

            showAlert(res.message);
            submodalExcel.hidden = true;
            fileInput.value = '';
            textInput.value = '';
            await loadRecipeData(false);
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    });

    // Initial Load
    loadRecipeData(true);
})();
