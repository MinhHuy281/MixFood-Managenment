// # File này chịu trách nhiệm xử lý hộp thoại Quản lý Khu vực & Bàn ăn (Dining Admin Modal) trực tiếp trên màn hình thu ngân POS.
// =========================================================================
    // POS DINING ADMIN MODAL CONTROLLER (KHU VỰC - ĐIỂM BÁN ADMIN TRÊN POS)
    // =========================================================================
    (() => {
        const diningModal = document.getElementById('pos-dining-admin-modal');
        const openDiningBtn = document.getElementById('open-dining-admin-menu');
        const closeDiningBtn = document.getElementById('pos-dining-modal-close');
        const alertBanner = document.getElementById('modal-pos-dining-alert');

        let areasData = [];
        let tablesData = [];
        let selectedAreaId = null;
        let selectedTableId = null;
        let hasChanges = false;

        const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

        const showAlert = (message, type = 'success') => {
            if (!alertBanner) return;
            alertBanner.className = `menu-alert-banner ${type}`;
            alertBanner.textContent = message;
            alertBanner.hidden = false;
            setTimeout(() => { alertBanner.hidden = true; }, 4000);
        };

        const loadDiningData = async () => {
            try {
                const resp = await fetch('/dining/api/data/');
                if (!resp.ok) throw new Error('Không thể tải dữ liệu khu vực và điểm bán.');
                const data = await resp.json();
                areasData = data.areas || [];
                tablesData = data.tables || [];

                if (!selectedAreaId && areasData.length > 0) {
                    selectedAreaId = areasData[0].id;
                }
                renderAreasTable();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        };

        const renderAreasTable = () => {
            const tbody = document.getElementById('modal-pos-areas-tbody');
            const countBadge = document.getElementById('modal-pos-areas-count');
            const selectArea = document.getElementById('pos-table-area');

            if (!tbody) return;
            tbody.innerHTML = '';
            if (countBadge) countBadge.textContent = `${areasData.length} khu vực`;
            if (selectArea) selectArea.innerHTML = '';

            if (areasData.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 28px; color: var(--slate-400);">Chưa có khu vực. Bấm "Thêm" để bắt đầu.</td></tr>`;
                selectedAreaId = null;
                renderTablesTable();
                return;
            }

            if (!areasData.some(a => a.id === selectedAreaId)) {
                selectedAreaId = areasData[0].id;
            }

            areasData.forEach((area, idx) => {
                const isSelected = area.id === selectedAreaId;
                const tr = document.createElement('tr');
                tr.className = `area-row ${isSelected ? 'selected' : ''}`;
                tr.dataset.areaId = area.id;
                tr.innerHTML = `
                    <td class="col-stt">${idx + 1}</td>
                    <td><strong>${area.name}</strong></td>
                    <td>${area.area_type || 'Nhà hàng cafe'}</td>
                `;
                tr.addEventListener('click', () => {
                    selectedAreaId = area.id;
                    selectedTableId = null;
                    document.querySelectorAll('#modal-pos-areas-tbody .area-row').forEach(r => r.classList.remove('selected'));
                    tr.classList.add('selected');
                    renderTablesTable();
                });
                tr.addEventListener('dblclick', () => {
                    openEditArea(area);
                });
                tbody.appendChild(tr);

                if (selectArea) {
                    const opt = document.createElement('option');
                    opt.value = area.id;
                    opt.textContent = area.name;
                    if (area.id === selectedAreaId) opt.selected = true;
                    selectArea.appendChild(opt);
                }
            });

            renderTablesTable();
        };

        const renderTablesTable = () => {
            const tbody = document.getElementById('modal-pos-tables-tbody');
            const countBadge = document.getElementById('modal-pos-tables-count');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (!selectedAreaId) {
                if (countBadge) countBadge.textContent = '0 điểm bán';
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 28px; color: var(--slate-400);">Chọn một khu vực bên trái.</td></tr>`;
                return;
            }

            const area = areasData.find(a => a.id === selectedAreaId);
            const filtered = tablesData.filter(t => t.area_id === selectedAreaId);
            if (countBadge) countBadge.textContent = `${area ? area.name : ''} (${filtered.length} điểm bán)`;

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 28px; color: var(--slate-400);">Chưa có điểm bán trong khu vực này.</td></tr>`;
                selectedTableId = null;
                return;
            }

            if (!selectedTableId || !filtered.some(t => t.id === selectedTableId)) {
                selectedTableId = filtered[0].id;
            }

            filtered.forEach((table, idx) => {
                const isSelected = table.id === selectedTableId;
                const tr = document.createElement('tr');
                tr.className = `table-row ${isSelected ? 'selected' : ''}`;
                tr.dataset.tableId = table.id;
                tr.innerHTML = `
                    <td class="col-stt">${idx + 1}</td>
                    <td><strong>${table.name}</strong></td>
                    <td><code>${table.code}</code></td>
                    <td style="text-align: center;">${table.capacity || 4}</td>
                    <td><span class="table-status-pill ${table.status || 'available'}">${table.status_display || 'Trống'}</span></td>
                `;
                tr.addEventListener('click', () => {
                    selectedTableId = table.id;
                    document.querySelectorAll('#modal-pos-tables-tbody .table-row').forEach(r => r.classList.remove('selected'));
                    tr.classList.add('selected');
                });
                tr.addEventListener('dblclick', () => {
                    openEditTable(table);
                });
                tbody.appendChild(tr);
            });
        };

        // Area Add/Edit Modal
        const submodalArea = document.getElementById('pos-submodal-area');
        const areaTitle = document.getElementById('pos-submodal-area-title');
        const areaIdInput = document.getElementById('pos-area-id');
        const areaNameInput = document.getElementById('pos-area-name');
        const areaTypeInput = document.getElementById('pos-area-type');
        const areaOrderInput = document.getElementById('pos-area-order');

        const openAddArea = () => {
            if (!submodalArea) return;
            areaTitle.textContent = 'Thêm khu vực mới';
            areaIdInput.value = '';
            areaNameInput.value = '';
            areaTypeInput.value = 'Nhà hàng cafe';
            areaOrderInput.value = (areasData.length + 1);
            submodalArea.hidden = false;
            areaNameInput.focus();
        };

        const openEditArea = (area) => {
            if (!submodalArea || !area) return;
            areaTitle.textContent = 'Chỉnh sửa khu vực';
            areaIdInput.value = area.id;
            areaNameInput.value = area.name;
            areaTypeInput.value = area.area_type || 'Nhà hàng cafe';
            areaOrderInput.value = area.display_order || 1;
            submodalArea.hidden = false;
            areaNameInput.focus();
        };

        document.getElementById('modal-pos-btn-add-area')?.addEventListener('click', openAddArea);
        document.getElementById('modal-pos-btn-edit-area')?.addEventListener('click', () => {
            const area = areasData.find(a => a.id === selectedAreaId);
            if (!area) {
                showAlert('Vui lòng chọn khu vực cần sửa.', 'error');
                return;
            }
            openEditArea(area);
        });

        document.getElementById('pos-submodal-area-close')?.addEventListener('click', () => { submodalArea.hidden = true; });
        document.getElementById('pos-submodal-area-cancel')?.addEventListener('click', () => { submodalArea.hidden = true; });

        document.getElementById('pos-form-area')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                id: areaIdInput.value || undefined,
                name: areaNameInput.value.trim(),
                area_type: areaTypeInput.value.trim() || 'Nhà hàng cafe',
                display_order: Number(areaOrderInput.value) || 0,
            };

            try {
                const resp = await fetch('/dining/api/save-area/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify(payload),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi lưu khu vực.');

                if (payload.id) {
                    const idx = areasData.findIndex(a => a.id === Number(payload.id));
                    if (idx !== -1) areasData[idx] = res.area;
                } else {
                    areasData.push(res.area);
                    selectedAreaId = res.area.id;
                }

                hasChanges = true;
                submodalArea.hidden = true;
                renderAreasTable();
                showAlert(res.message);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        document.getElementById('modal-pos-btn-del-area')?.addEventListener('click', async () => {
            const area = areasData.find(a => a.id === selectedAreaId);
            if (!area) {
                showAlert('Vui lòng chọn khu vực cần xóa.', 'error');
                return;
            }
            if (!confirm(`Bạn có chắc muốn xóa khu vực "${area.name}" và các bàn trực thuộc?`)) return;

            try {
                const resp = await fetch(`/dining/api/delete-area/${area.id}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa khu vực.');

                areasData = areasData.filter(a => a.id !== area.id);
                tablesData = tablesData.filter(t => t.area_id !== area.id);
                selectedAreaId = areasData.length > 0 ? areasData[0].id : null;
                selectedTableId = null;
                hasChanges = true;
                renderAreasTable();
                showAlert(res.message);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Table Add/Edit Modal
        const submodalTable = document.getElementById('pos-submodal-table');
        const tableTitle = document.getElementById('pos-submodal-table-title');
        const tableIdInput = document.getElementById('pos-table-id');
        const tableAreaSelect = document.getElementById('pos-table-area');
        const tableNameInput = document.getElementById('pos-table-name');
        const tableCodeInput = document.getElementById('pos-table-code');
        const tableCapacityInput = document.getElementById('pos-table-capacity');
        const tableOrderInput = document.getElementById('pos-table-order');

        const openAddTable = () => {
            if (!submodalTable || !selectedAreaId) {
                showAlert('Vui lòng chọn hoặc thêm khu vực trước.', 'error');
                return;
            }
            tableTitle.textContent = 'Thêm điểm bán mới';
            tableIdInput.value = '';
            tableAreaSelect.value = String(selectedAreaId);
            tableNameInput.value = '';
            tableCodeInput.value = '';
            tableCapacityInput.value = '4';
            tableOrderInput.value = (tablesData.filter(t => t.area_id === selectedAreaId).length + 1);
            submodalTable.hidden = false;
            tableNameInput.focus();
        };

        const openEditTable = (table) => {
            if (!submodalTable || !table) return;
            tableTitle.textContent = 'Chỉnh sửa điểm bán';
            tableIdInput.value = table.id;
            tableAreaSelect.value = String(table.area_id);
            tableNameInput.value = table.name;
            tableCodeInput.value = table.code;
            tableCapacityInput.value = table.capacity || 4;
            tableOrderInput.value = table.display_order || 1;
            submodalTable.hidden = false;
            tableNameInput.focus();
        };

        document.getElementById('modal-pos-btn-add-table')?.addEventListener('click', openAddTable);
        document.getElementById('modal-pos-btn-edit-table')?.addEventListener('click', () => {
            const table = tablesData.find(t => t.id === selectedTableId);
            if (!table) {
                showAlert('Vui lòng chọn điểm bán cần sửa.', 'error');
                return;
            }
            openEditTable(table);
        });

        document.getElementById('pos-submodal-table-close')?.addEventListener('click', () => { submodalTable.hidden = true; });
        document.getElementById('pos-submodal-table-cancel')?.addEventListener('click', () => { submodalTable.hidden = true; });

        document.getElementById('pos-form-table')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                id: tableIdInput.value || undefined,
                area_id: tableAreaSelect.value,
                name: tableNameInput.value.trim(),
                code: tableCodeInput.value.trim(),
                capacity: Number(tableCapacityInput.value) || 4,
                display_order: Number(tableOrderInput.value) || 0,
            };

            try {
                const resp = await fetch('/dining/api/save-table/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify(payload),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi lưu điểm bán.');

                if (payload.id) {
                    const idx = tablesData.findIndex(t => t.id === Number(payload.id));
                    if (idx !== -1) tablesData[idx] = res.table;
                    selectedTableId = res.table.id;
                } else {
                    tablesData.push(res.table);
                    selectedTableId = res.table.id;
                }

                hasChanges = true;
                submodalTable.hidden = true;
                renderTablesTable();
                showAlert(res.message);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        document.getElementById('modal-pos-btn-del-table')?.addEventListener('click', async () => {
            const table = tablesData.find(t => t.id === selectedTableId);
            if (!table) {
                showAlert('Vui lòng chọn điểm bán cần xóa.', 'error');
                return;
            }
            if (!confirm(`Bạn có chắc muốn xóa điểm bán "${table.name}"?`)) return;

            try {
                const resp = await fetch(`/dining/api/delete-table/${table.id}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi xóa điểm bán.');

                tablesData = tablesData.filter(t => t.id !== table.id);
                selectedTableId = null;
                hasChanges = true;
                renderTablesTable();
                showAlert(res.message);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        // Excel Import Modal
        const submodalExcel = document.getElementById('pos-submodal-excel');
        document.getElementById('modal-pos-btn-excel-import')?.addEventListener('click', () => {
            if (submodalExcel) submodalExcel.hidden = false;
        });
        document.getElementById('pos-submodal-excel-close')?.addEventListener('click', () => { submodalExcel.hidden = true; });
        document.getElementById('pos-submodal-excel-cancel')?.addEventListener('click', () => { submodalExcel.hidden = true; });

        document.getElementById('pos-form-excel')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('pos-excel-file');
            const textInput = document.getElementById('pos-excel-text');
            const formData = new FormData();

            if (fileInput.files.length > 0) {
                formData.append('file', fileInput.files[0]);
            } else if (textInput.value.trim()) {
                formData.append('csv_text', textInput.value.trim());
            } else {
                showAlert('Vui lòng chọn file hoặc dán dữ liệu Excel.', 'error');
                return;
            }

            const btnSubmit = document.getElementById('pos-btn-submit-excel');
            if (btnSubmit) btnSubmit.disabled = true;

            try {
                const resp = await fetch('/dining/import/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                    body: formData,
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi khi nhập dữ liệu.');

                hasChanges = true;
                showAlert(res.message);
                submodalExcel.hidden = true;
                fileInput.value = '';
                textInput.value = '';

                // Reload data
                await loadDiningData();
            } catch (err) {
                showAlert(err.message, 'error');
            } finally {
                if (btnSubmit) btnSubmit.disabled = false;
            }
        });

        // Open Dining Admin Modal from POS menu
        if (openDiningBtn) {
            openDiningBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Close open dropdowns
                document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
                document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

                if (diningModal) {
                    diningModal.hidden = false;
                    loadDiningData();
                }
            });
        }

        // Close Dining Admin Modal
        if (closeDiningBtn) {
            closeDiningBtn.addEventListener('click', () => {
                if (diningModal) diningModal.hidden = true;
                if (hasChanges) {
                    window.location.reload();
                }
            });
        }
    })();
