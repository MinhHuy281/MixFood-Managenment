// # File này chịu trách nhiệm xử lý giao diện trang Quản lý Người dùng (Admin): tìm kiếm, lọc vai trò, thêm/sửa/xóa tài khoản nhân viên.
document.addEventListener('DOMContentLoaded', () => {
    const tbody = document.getElementById('page-user-admin-tbody');
    const alertBanner = document.getElementById('page-user-modal-alert');
    const btnAdd = document.getElementById('page-user-btn-add');
    const btnEdit = document.getElementById('page-user-btn-edit');
    const btnDel = document.getElementById('page-user-btn-delete');
    const pinCheckbox = document.getElementById('page-user-allow-pin-only');
    const selectedHint = document.getElementById('page-user-selected-hint');

    const form = document.getElementById('page-user-admin-form');
    const formTitle = document.getElementById('page-user-form-title');
    const formBadge = document.getElementById('page-user-form-badge');
    const idInput = document.getElementById('page-user-id');
    const usernameInput = document.getElementById('page-user-username');
    const passwordInput = document.getElementById('page-user-password');
    const fullnameInput = document.getElementById('page-user-fullname');
    const phoneInput = document.getElementById('page-user-phone');
    const deptSelect = document.getElementById('page-user-department');
    const areaInput = document.getElementById('page-user-area');
    const areaHelpBtn = document.getElementById('page-user-area-help-btn');
    const areaPopover = document.getElementById('page-user-area-popover');
    const areaChips = document.getElementById('page-user-area-chips');
    const btnCancel = document.getElementById('page-user-btn-cancel');

    let usersList = [];
    let selectedUserId = null;

    const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';
    const showAlert = (msg, type = 'success') => {
        if (!alertBanner) return;
        alertBanner.className = `menu-alert-banner ${type}`;
        alertBanner.textContent = msg;
        alertBanner.hidden = false;
        setTimeout(() => { alertBanner.hidden = true; }, 4000);
    };

    const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const resetFormToAdd = (focusInput = false) => {
        idInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        passwordInput.placeholder = 'Nhập mật khẩu...';
        fullnameInput.value = '';
        phoneInput.value = '';
        deptSelect.value = 'undefined';
        areaInput.value = 'ALL';
        formTitle.textContent = 'Thêm người dùng';
        formBadge.textContent = 'Tạo mới';
        formBadge.classList.remove('mode-edit');
        if (focusInput) usernameInput.focus();
    };

    const populateFormForEdit = (u) => {
        if (!u) return;
        idInput.value = u.id;
        usernameInput.value = u.username;
        passwordInput.value = '######';
        passwordInput.placeholder = 'Để ###### nếu giữ nguyên mật khẩu';
        fullnameInput.value = u.full_name || '';
        phoneInput.value = u.phone || '';
        deptSelect.value = u.department || 'undefined';
        areaInput.value = u.area_code || 'ALL';
        formTitle.textContent = 'Sửa người dùng';
        formBadge.textContent = `Đang sửa #${u.code}`;
        formBadge.classList.add('mode-edit');
    };

    const renderTable = () => {
        if (!tbody) return;
        if (!usersList.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="activity-empty-notice">Chưa có người dùng nào.</td></tr>';
            return;
        }
        tbody.innerHTML = usersList.map(u => `
            <tr class="user-admin-row ${selectedUserId === u.id ? 'selected' : ''}" data-id="${u.id}">
                <td class="text-center"><strong>${u.code}</strong></td>
                <td><strong>${escapeHtml(u.username)}</strong></td>
                <td class="text-muted">######</td>
                <td>${escapeHtml(u.full_name)}</td>
                <td>${escapeHtml(u.phone)}</td>
                <td><span class="user-dept-badge dept-${escapeHtml(u.department)}">${escapeHtml(u.department_display)}</span></td>
                <td><code>${escapeHtml(u.area_code)}</code></td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.user-admin-row').forEach(tr => {
            tr.addEventListener('click', () => {
                selectedUserId = Number(tr.dataset.id);
                tbody.querySelectorAll('.user-admin-row').forEach(r => r.classList.remove('selected'));
                tr.classList.add('selected');
                const u = usersList.find(x => x.id === selectedUserId);
                btnEdit.disabled = !u;
                btnDel.disabled = !u;
                if (u && selectedHint) {
                    selectedHint.innerHTML = `Đang chọn: <strong>${escapeHtml(u.username)}</strong> (${escapeHtml(u.full_name)} - ${escapeHtml(u.department_display)})`;
                }
            });
            tr.addEventListener('dblclick', () => {
                selectedUserId = Number(tr.dataset.id);
                const u = usersList.find(x => x.id === selectedUserId);
                if (u) populateFormForEdit(u);
            });
        });
    };

    const loadUsers = async () => {
        const resp = await fetch('/accounts/api/users/');
        const data = await resp.json();
        usersList = data.users || [];
        if (pinCheckbox) pinCheckbox.checked = Boolean(data.allow_numeric_password_only);
        renderTable();
    };

    btnAdd?.addEventListener('click', () => resetFormToAdd(true));
    btnEdit?.addEventListener('click', () => {
        const u = usersList.find(x => x.id === selectedUserId);
        if (!u) return showAlert('Vui lòng chọn 1 người dùng trên bảng để sửa.', 'error');
        populateFormForEdit(u);
        fullnameInput.focus();
    });
    btnCancel?.addEventListener('click', () => resetFormToAdd(false));

    btnDel?.addEventListener('click', async () => {
        const u = usersList.find(x => x.id === selectedUserId);
        if (!u) return;
        if (!confirm(`Bạn có chắc chắn muốn xóa người dùng "${u.username}" (${u.full_name})?`)) return;
        const resp = await fetch(`/accounts/api/users/delete/${u.id}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken() },
        });
        const res = await resp.json();
        if (!resp.ok) return showAlert(res.error || 'Không thể xóa người dùng.', 'error');
        selectedUserId = null;
        btnEdit.disabled = true;
        btnDel.disabled = true;
        resetFormToAdd(false);
        showAlert(res.message);
        await loadUsers();
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            id: idInput.value || undefined,
            username: usernameInput.value.trim(),
            password: passwordInput.value.trim(),
            full_name: fullnameInput.value.trim(),
            phone: phoneInput.value.trim(),
            department: deptSelect.value,
            area_code: areaInput.value.trim() || 'ALL',
        };
        const resp = await fetch('/accounts/api/users/save/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
            body: JSON.stringify(payload),
        });
        const res = await resp.json();
        if (!resp.ok) return showAlert(res.error || 'Lỗi lưu người dùng.', 'error');
        selectedUserId = res.user?.id || null;
        resetFormToAdd(false);
        showAlert(res.message);
        await loadUsers();
    });

    pinCheckbox?.addEventListener('change', async () => {
        const resp = await fetch('/accounts/api/users/config/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
            body: JSON.stringify({ allow_numeric_password_only: pinCheckbox.checked }),
        });
        const res = await resp.json();
        if (resp.ok) showAlert(res.message);
    });

    areaHelpBtn?.addEventListener('click', () => {
        if (areaPopover) areaPopover.hidden = !areaPopover.hidden;
    });
    areaChips?.querySelectorAll('.area-pick-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            areaInput.value = chip.dataset.area;
            areaPopover.hidden = true;
        });
    });

    loadUsers();
});
