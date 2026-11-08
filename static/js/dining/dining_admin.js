// # File này chịu trách nhiệm xử lý giao diện trang Quản lý Khu vực & Bàn ăn (Dining Admin): thêm/sửa/xóa khu vực, điểm bàn và nhập/xuất Excel.
document.addEventListener('DOMContentLoaded', () => {
    let areasData = [];
    let tablesData = [];

    try {
        areasData = JSON.parse(document.getElementById('server-areas-json').textContent || '[]');
        tablesData = JSON.parse(document.getElementById('server-tables-json').textContent || '[]');
    } catch (e) {
        console.error('Error parsing dining server JSON:', e);
    }

    let selectedAreaId = areasData.length > 0 ? areasData[0].id : null;
    let selectedTableId = null;

    const alertBanner = document.getElementById('dining-alert-banner');
    const showAlert = (message, type = 'success') => {
        if (!alertBanner) return;
        alertBanner.className = `menu-alert-banner ${type}`;
        alertBanner.textContent = message;
        alertBanner.hidden = false;
        setTimeout(() => { alertBanner.hidden = true; }, 4000);
    };

    const csrfToken = document.querySelector('[name="csrfmiddlewaretoken"]').value;

    const areasTableBody = document.getElementById('areas-table-body');
    const tablesTableBody = document.getElementById('tables-table-body');
    const areasCountBadge = document.getElementById('areas-count-badge');
    const currentAreaTargetLabel = document.getElementById('current-area-target-label');
    const tableInputAreaSelect = document.getElementById('table-input-area');

    // Render Areas Table
    const renderAreasTable = () => {
        areasCountBadge.textContent = `${areasData.length} khu vực`;
        areasTableBody.innerHTML = '';

        if (tableInputAreaSelect) {
            tableInputAreaSelect.innerHTML = '';
        }

        if (areasData.length === 0) {
            areasTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 32px; color: var(--slate-400);">Chưa có khu vực nào. Nhấn "+ Thêm" để bắt đầu.</td></tr>`;
            selectedAreaId = null;
            renderTablesTable();
            return;
        }

        // If current selectedAreaId no longer exists, select first
        if (!areasData.some(a => a.id === selectedAreaId)) {
            selectedAreaId = areasData[0].id;
        }

        areasData.forEach((area, index) => {
            const isSelected = area.id === selectedAreaId;
            const tr = document.createElement('tr');
            tr.className = `area-row ${isSelected ? 'selected' : ''}`;
            tr.dataset.areaId = area.id;
            tr.innerHTML = `
                <td class="col-stt">${index + 1}</td>
                <td><strong>${area.name}</strong></td>
                <td>${area.area_type || 'Nhà hàng cafe'}</td>
            `;
            tr.addEventListener('click', () => {
                selectedAreaId = area.id;
                selectedTableId = null;
                document.querySelectorAll('.area-row').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                renderTablesTable();
            });
            tr.addEventListener('dblclick', () => {
                openEditAreaModal(area);
            });
            areasTableBody.appendChild(tr);

            if (tableInputAreaSelect) {
                const opt = document.createElement('option');
                opt.value = area.id;
                opt.textContent = area.name;
                if (area.id === selectedAreaId) opt.selected = true;
                tableInputAreaSelect.appendChild(opt);
            }
        });

        renderTablesTable();
    };

    // Render Tables Table for currently selected area
    const renderTablesTable = () => {
        tablesTableBody.innerHTML = '';
        if (!selectedAreaId) {
            currentAreaTargetLabel.textContent = '0 điểm bán';
            tablesTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--slate-400);">Chọn một khu vực bên trái để xem điểm bán.</td></tr>`;
            return;
        }

        const currentArea = areasData.find(a => a.id === selectedAreaId);
        const filteredTables = tablesData.filter(t => t.area_id === selectedAreaId);

        currentAreaTargetLabel.textContent = currentArea ? `${currentArea.name} (${filteredTables.length} điểm bán)` : `${filteredTables.length} điểm bán`;

        if (filteredTables.length === 0) {
            tablesTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 32px; color: var(--slate-400);">Chưa có điểm bán nào trong khu vực "${currentArea ? currentArea.name : ''}".</td></tr>`;
            selectedTableId = null;
            return;
        }

        if (!selectedTableId || !filteredTables.some(t => t.id === selectedTableId)) {
            selectedTableId = filteredTables[0].id;
        }

        filteredTables.forEach((table, index) => {
            const isSelected = table.id === selectedTableId;
            const tr = document.createElement('tr');
            tr.className = `table-row ${isSelected ? 'selected' : ''}`;
            tr.dataset.tableId = table.id;
            tr.innerHTML = `
                <td class="col-stt">${index + 1}</td>
                <td><strong>${table.name}</strong></td>
                <td><code>${table.code}</code></td>
                <td style="text-align: center;">${table.capacity || 4}</td>
                <td><span class="table-status-pill ${table.status || 'available'}">${table.status_display || 'Trống'}</span></td>
            `;
            tr.addEventListener('click', () => {
                selectedTableId = table.id;
                document.querySelectorAll('.table-row').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
            });
            tr.addEventListener('dblclick', () => {
                openEditTableModal(table);
            });
            tablesTableBody.appendChild(tr);
        });
    };

    // Modal Area Elements
    const modalAreaForm = document.getElementById('modal-area-form');
    const modalAreaTitle = document.getElementById('modal-area-title');
    const areaInputId = document.getElementById('area-input-id');
    const areaInputName = document.getElementById('area-input-name');
    const areaInputType = document.getElementById('area-input-type');
    const areaInputOrder = document.getElementById('area-input-order');

    const openAddAreaModal = () => {
        modalAreaTitle.textContent = 'Thêm khu vực';
        areaInputId.value = '';
        areaInputName.value = '';
        areaInputType.value = 'Nhà hàng cafe';
        areaInputOrder.value = (areasData.length + 1);
        modalAreaForm.hidden = false;
        areaInputName.focus();
    };

    const openEditAreaModal = (area) => {
        if (!area) return;
        modalAreaTitle.textContent = 'Chỉnh sửa khu vực';
        areaInputId.value = area.id;
        areaInputName.value = area.name;
        areaInputType.value = area.area_type || 'Nhà hàng cafe';
        areaInputOrder.value = area.display_order || 1;
        modalAreaForm.hidden = false;
        areaInputName.focus();
    };

    document.getElementById('btn-add-area').addEventListener('click', openAddAreaModal);
    document.getElementById('btn-edit-area').addEventListener('click', () => {
        const area = areasData.find(a => a.id === selectedAreaId);
        if (!area) {
            showAlert('Vui lòng chọn khu vực cần sửa.', 'error');
            return;
        }
        openEditAreaModal(area);
    });

    document.getElementById('modal-area-close').addEventListener('click', () => { modalAreaForm.hidden = true; });
    document.getElementById('modal-area-cancel').addEventListener('click', () => { modalAreaForm.hidden = true; });

    document.getElementById('form-area').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id: areaInputId.value || undefined,
            name: areaInputName.value.trim(),
            area_type: areaInputType.value.trim() || 'Nhà hàng cafe',
            display_order: Number(areaInputOrder.value) || 0,
        };

        try {
            const resp = await fetch('/dining/api/save-area/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Lỗi khi lưu khu vực.');

            if (payload.id) {
                const idx = areasData.findIndex(a => a.id === Number(payload.id));
                if (idx !== -1) areasData[idx] = data.area;
            } else {
                areasData.push(data.area);
                selectedAreaId = data.area.id;
            }

            modalAreaForm.hidden = true;
            renderAreasTable();
            showAlert(data.message || 'Lưu khu vực thành công!');
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    document.getElementById('btn-del-area').addEventListener('click', async () => {
        const area = areasData.find(a => a.id === selectedAreaId);
        if (!area) {
            showAlert('Vui lòng chọn khu vực cần xóa.', 'error');
            return;
        }
        if (!confirm(`Bạn có chắc chắn muốn xóa/ngừng sử dụng khu vực "${area.name}" và các điểm bán trực thuộc?`)) return;

        try {
            const resp = await fetch(`/dining/api/delete-area/${area.id}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Lỗi khi xóa khu vực.');

            areasData = areasData.filter(a => a.id !== area.id);
            tablesData = tablesData.filter(t => t.area_id !== area.id);
            selectedAreaId = areasData.length > 0 ? areasData[0].id : null;
            selectedTableId = null;
            renderAreasTable();
            showAlert(data.message || 'Đã xóa khu vực.');
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Modal Table Elements
    const modalTableForm = document.getElementById('modal-table-form');
    const modalTableTitle = document.getElementById('modal-table-title');
    const tableInputId = document.getElementById('table-input-id');
    const tableInputArea = document.getElementById('table-input-area');
    const tableInputName = document.getElementById('table-input-name');
    const tableInputCode = document.getElementById('table-input-code');
    const tableInputCapacity = document.getElementById('table-input-capacity');
    const tableInputOrder = document.getElementById('table-input-order');

    const openAddTableModal = () => {
        if (!selectedAreaId) {
            showAlert('Vui lòng chọn hoặc thêm một khu vực trước.', 'error');
            return;
        }
        modalTableTitle.textContent = 'Thêm điểm bán mới';
        tableInputId.value = '';
        tableInputArea.value = String(selectedAreaId);
        tableInputName.value = '';
        tableInputCode.value = '';
        tableInputCapacity.value = '4';
        tableInputOrder.value = (tablesData.filter(t => t.area_id === selectedAreaId).length + 1);
        modalTableForm.hidden = false;
        tableInputName.focus();
    };

    const openEditTableModal = (table) => {
        if (!table) return;
        modalTableTitle.textContent = 'Chỉnh sửa điểm bán';
        tableInputId.value = table.id;
        tableInputArea.value = String(table.area_id);
        tableInputName.value = table.name;
        tableInputCode.value = table.code;
        tableInputCapacity.value = table.capacity || 4;
        tableInputOrder.value = table.display_order || 1;
        modalTableForm.hidden = false;
        tableInputName.focus();
    };

    document.getElementById('btn-add-table').addEventListener('click', openAddTableModal);
    document.getElementById('btn-edit-table').addEventListener('click', () => {
        const table = tablesData.find(t => t.id === selectedTableId);
        if (!table) {
            showAlert('Vui lòng chọn điểm bán cần sửa.', 'error');
            return;
        }
        openEditTableModal(table);
    });

    document.getElementById('modal-table-close').addEventListener('click', () => { modalTableForm.hidden = true; });
    document.getElementById('modal-table-cancel').addEventListener('click', () => { modalTableForm.hidden = true; });

    document.getElementById('form-table').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id: tableInputId.value || undefined,
            area_id: tableInputArea.value,
            name: tableInputName.value.trim(),
            code: tableInputCode.value.trim(),
            capacity: Number(tableInputCapacity.value) || 4,
            display_order: Number(tableInputOrder.value) || 0,
        };

        try {
            const resp = await fetch('/dining/api/save-table/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
                body: JSON.stringify(payload),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Lỗi khi lưu điểm bán.');

            if (payload.id) {
                const idx = tablesData.findIndex(t => t.id === Number(payload.id));
                if (idx !== -1) tablesData[idx] = data.table;
                selectedTableId = data.table.id;
            } else {
                tablesData.push(data.table);
                selectedTableId = data.table.id;
            }

            modalTableForm.hidden = true;
            renderTablesTable();
            showAlert(data.message || 'Lưu điểm bán thành công!');
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    document.getElementById('btn-del-table').addEventListener('click', async () => {
        const table = tablesData.find(t => t.id === selectedTableId);
        if (!table) {
            showAlert('Vui lòng chọn điểm bán cần xóa.', 'error');
            return;
        }
        if (!confirm(`Bạn có chắc chắn muốn xóa điểm bán "${table.name}"?`)) return;

        try {
            const resp = await fetch(`/dining/api/delete-table/${table.id}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Lỗi khi xóa điểm bán.');

            tablesData = tablesData.filter(t => t.id !== table.id);
            selectedTableId = null;
            renderTablesTable();
            showAlert(data.message || 'Đã xóa điểm bán.');
        } catch (err) {
            showAlert(err.message, 'error');
        }
    });

    // Modal Excel Import
    const modalExcelImport = document.getElementById('modal-excel-import');
    document.getElementById('btn-open-excel-import').addEventListener('click', () => {
        modalExcelImport.hidden = false;
    });
    document.getElementById('modal-excel-close').addEventListener('click', () => { modalExcelImport.hidden = true; });
    document.getElementById('modal-excel-cancel').addEventListener('click', () => { modalExcelImport.hidden = true; });

    document.getElementById('form-excel-import').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('excel-file-input');
        const textInput = document.getElementById('excel-text-input');
        const formData = new FormData();

        if (fileInput.files.length > 0) {
            formData.append('file', fileInput.files[0]);
        } else if (textInput.value.trim()) {
            formData.append('csv_text', textInput.value.trim());
        } else {
            showAlert('Vui lòng chọn file CSV hoặc dán nội dung Excel.', 'error');
            return;
        }

        const btnSubmit = document.getElementById('btn-submit-excel');
        btnSubmit.disabled = true;

        try {
            const resp = await fetch('/dining/import/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken },
                body: formData,
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Lỗi khi nhập dữ liệu.');

            showAlert(data.message || 'Nhập dữ liệu thành công!');
            modalExcelImport.hidden = true;
            fileInput.value = '';
            textInput.value = '';

            // Reload data from API to refresh table
            const reloadResp = await fetch('/dining/api/data/');
            const freshData = await reloadResp.json();
            areasData = freshData.areas;
            tablesData = freshData.tables;
            renderAreasTable();
        } catch (err) {
            showAlert(err.message, 'error');
        } finally {
            btnSubmit.disabled = false;
        }
    });

    // Initial render
    renderAreasTable();
});
