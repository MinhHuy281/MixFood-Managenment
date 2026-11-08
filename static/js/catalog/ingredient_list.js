// # File này chịu trách nhiệm xử lý giao diện trang Quản lý Mặt hàng Nguyên liệu (Admin): lọc theo 3 kho, tìm kiếm, thêm/sửa/xóa mặt hàng, cấu hình quy cách Thùng -> Hộp và nhập/xuất Excel.
(function() {
        const csrfToken = () => {
            const match = document.cookie.match(/csrftoken=([^;]+)/);
            return match ? match[1] : '';
        };

        let selectedId = null;
        let ingredientsData = [];
        let currentWarehouse = 'all';

        const alertBanner = document.getElementById('page-ing-alert');
        const searchInput = document.getElementById('page-ing-search');
        const groupFilter = document.getElementById('page-ing-group-filter');
        const tbody = document.getElementById('page-ing-tbody');
        const countSpan = document.getElementById('page-ing-count');

        const submodalIng = document.getElementById('page-submodal-ingredient');
        const submodalExcel = document.getElementById('page-submodal-ing-excel');

        function showAlert(msg, type = 'success') {
            if (!alertBanner) return;
            alertBanner.textContent = msg;
            alertBanner.className = `menu-alert-banner alert-${type}`;
            alertBanner.hidden = false;
            setTimeout(() => { alertBanner.hidden = true; }, 4000);
        }

        async function loadData() {
            const q = searchInput.value.trim();
            const g = groupFilter.value;
            const params = new URLSearchParams();
            if (q) params.set('q', q);
            if (g) params.set('group', g);
            if (currentWarehouse && currentWarehouse !== 'all') params.set('warehouse', currentWarehouse);

            try {
                const res = await fetch(`/catalog/ingredients/api/list/?${params.toString()}`);
                const data = await res.json();
                ingredientsData = data.ingredients || [];

                if (data.warehouse_counts) {
                    const c = data.warehouse_counts;
                    if (document.getElementById('page-wh-count-all')) document.getElementById('page-wh-count-all').textContent = c.all;
                    if (document.getElementById('page-wh-count-fresh')) document.getElementById('page-wh-count-fresh').textContent = c.fresh;
                    if (document.getElementById('page-wh-count-dry')) document.getElementById('page-wh-count-dry').textContent = c.dry;
                    if (document.getElementById('page-wh-count-beverage')) document.getElementById('page-wh-count-beverage').textContent = c.beverage;
                }

                renderTable();
            } catch (err) {
                console.error(err);
            }
        }

        function renderTable() {
            countSpan.textContent = `${ingredientsData.length} mặt hàng`;
            if (ingredientsData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="empty-table-row">Không tìm thấy mặt hàng nào trong kho này.</td></tr>';
                selectedId = null;
                return;
            }

            tbody.innerHTML = ingredientsData.map(ing => {
                let whBadge = '';
                if (ing.storage_area === 'fresh') {
                    whBadge = '<span style="display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;">🥦 Kho 1: Tươi</span>';
                } else if (ing.storage_area === 'dry') {
                    whBadge = '<span style="display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; background: #fffbeb; color: #d97706; border: 1px solid #fde68a;">🥫 Kho 2: Khô & GV</span>';
                } else {
                    whBadge = '<span style="display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe;">🍹 Kho 3: Nước & Quả</span>';
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

            // Row click event
            tbody.querySelectorAll('.ingredient-row').forEach(row => {
                row.addEventListener('click', () => {
                    tbody.querySelectorAll('.ingredient-row').forEach(r => r.classList.remove('selected'));
                    row.classList.add('selected');
                    selectedId = Number(row.dataset.id);
                });
                row.addEventListener('dblclick', () => {
                    selectedId = Number(row.dataset.id);
                    openEditModal();
                });
            });
        }

        function openAddModal() {
            document.getElementById('page-submodal-ing-title').textContent = 'Thêm mặt hàng mới';
            document.getElementById('page-ing-id').value = '';
            document.getElementById('page-ing-group').value = groupFilter.value || '';
            document.getElementById('page-ing-name').value = '';
            document.getElementById('page-ing-code').value = '';
            document.getElementById('page-ing-unit').value = 'Kg';
            document.getElementById('page-ing-cost').value = '0';
            document.getElementById('page-ing-min-stock').value = '0.000';
            document.getElementById('page-ing-supplier').value = '';
            if (document.getElementById('page-ing-pack-size')) document.getElementById('page-ing-pack-size').value = '10';
            if (document.getElementById('page-ing-unpacked-unit')) document.getElementById('page-ing-unpacked-unit').value = 'phần';

            const defWh = (currentWarehouse && currentWarehouse !== 'all') ? currentWarehouse : 'fresh';
            const radio = document.querySelector(`input[name="page-ing-storage-area"][value="${defWh}"]`);
            if (radio) radio.checked = true;

            submodalIng.hidden = false;
        }

        function openEditModal() {
            const ing = ingredientsData.find(i => i.id === selectedId);
            if (!ing) {
                showAlert('Vui lòng chọn mặt hàng cần sửa.', 'error');
                return;
            }
            document.getElementById('page-submodal-ing-title').textContent = 'Sửa mặt hàng';
            document.getElementById('page-ing-id').value = ing.id;
            document.getElementById('page-ing-group').value = ing.group || '';
            document.getElementById('page-ing-name').value = ing.name;
            document.getElementById('page-ing-code').value = ing.code;
            document.getElementById('page-ing-unit').value = ing.unit;
            document.getElementById('page-ing-cost').value = ing.cost_formatted;
            document.getElementById('page-ing-min-stock').value = ing.minimum_stock_formatted;
            document.getElementById('page-ing-supplier').value = ing.supplier || '';
            if (document.getElementById('page-ing-pack-size')) document.getElementById('page-ing-pack-size').value = ing.pack_size || 10;
            if (document.getElementById('page-ing-unpacked-unit')) document.getElementById('page-ing-unpacked-unit').value = ing.unpacked_unit || 'phần';

            const sa = ing.storage_area || 'fresh';
            const radio = document.querySelector(`input[name="page-ing-storage-area"][value="${sa}"]`);
            if (radio) radio.checked = true;

            submodalIng.hidden = false;
        }

        // Warehouse tabs switch
        document.querySelectorAll('.btn-page-wh-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-page-wh-tab').forEach(b => {
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
                loadData();
            });
        });

        // Event listeners
        searchInput?.addEventListener('input', () => { loadData(); });
        groupFilter?.addEventListener('change', () => { loadData(); });

        document.getElementById('page-btn-add-ing')?.addEventListener('click', openAddModal);
        document.getElementById('page-btn-edit-ing')?.addEventListener('click', openEditModal);

        document.getElementById('page-submodal-ing-close')?.addEventListener('click', () => { submodalIng.hidden = true; });
        document.getElementById('page-submodal-ing-cancel')?.addEventListener('click', () => { submodalIng.hidden = true; });

        // Unit chips handler
        document.querySelectorAll('#page-submodal-ingredient .btn-pos-ing-unit-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const u = chip.dataset.unit;
                const unitInput = document.getElementById('page-ing-unit');
                if (unitInput && u) {
                    unitInput.value = u;
                }
            });
        });

        // Auto generate code handler
        document.getElementById('page-btn-auto-ing-code')?.addEventListener('click', () => {
            const codeInput = document.getElementById('page-ing-code');
            const rand = Math.floor(100 + Math.random() * 900);
            if (codeInput) {
                codeInput.value = `MH${rand}`;
            }
        });

        // Cost formatting mask
        const costInput = document.getElementById('page-ing-cost');
        if (costInput) {
            costInput.addEventListener('input', () => {
                const num = parseInt(costInput.value.replace(/\D/g, ''), 10);
                costInput.value = isNaN(num) ? '0' : num.toLocaleString('vi-VN');
            });
        }

        // Save form
        document.getElementById('page-form-ingredient')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selectedArea = document.querySelector('input[name="page-ing-storage-area"]:checked')?.value || 'fresh';
            const payload = {
                id: document.getElementById('page-ing-id').value || undefined,
                storage_area: selectedArea,
                group: document.getElementById('page-ing-group').value.trim(),
                name: document.getElementById('page-ing-name').value.trim(),
                code: document.getElementById('page-ing-code').value.trim(),
                unit: document.getElementById('page-ing-unit').value.trim(),
                average_cost: document.getElementById('page-ing-cost').value.trim(),
                minimum_stock: document.getElementById('page-ing-min-stock').value.trim(),
                supplier: document.getElementById('page-ing-supplier').value.trim(),
                pack_size: document.getElementById('page-ing-pack-size')?.value || 10,
                unpacked_unit: document.getElementById('page-ing-unpacked-unit')?.value.trim() || 'phần',
            };

            try {
                const resp = await fetch('/catalog/ingredients/api/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify(payload),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi lưu mặt hàng.');

                submodalIng.hidden = true;
                selectedId = res.ingredient.id;
                showAlert(res.message);
                await loadData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Delete
        document.getElementById('page-btn-del-ing')?.addEventListener('click', async () => {
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
                await loadData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Excel Import
        document.getElementById('page-btn-excel-import')?.addEventListener('click', () => {
            submodalExcel.hidden = false;
        });
        document.getElementById('page-submodal-ing-excel-close')?.addEventListener('click', () => { submodalExcel.hidden = true; });
        document.getElementById('page-submodal-ing-excel-cancel')?.addEventListener('click', () => { submodalExcel.hidden = true; });

        document.getElementById('page-form-ing-excel')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('page-ing-excel-file');
            const textInput = document.getElementById('page-ing-excel-text');
            const formData = new FormData();

            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            } else if (textInput.value.trim()) {
                formData.append('csv_text', textInput.value.trim());
            } else {
                showAlert('Vui lòng chọn file hoặc dán dữ liệu mặt hàng.', 'error');
                return;
            }

            const btnSubmit = document.getElementById('page-btn-submit-ing-excel');
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
                submodalExcel.hidden = true;
                fileInput.value = '';
                textInput.value = '';
                await loadData();
            } catch (err) {
                showAlert(err.message, 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        });

        // Initial load
        loadData();
    })();
