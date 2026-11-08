// # File này chịu trách nhiệm xử lý hộp thoại Quản lý Người dùng (User Admin Modal) và Đổi mật khẩu trên màn hình thu ngân POS.
// =========================================================================
    // POS USER ADMIN MODAL CONTROLLER (NGƯỜI DÙNG - ADMIN TRÊN POS)
    // =========================================================================
    (() => {
        const modal = document.getElementById('pos-user-admin-modal');
        const openBtn1 = document.getElementById('open-user-admin-menu');
        const openBtn2 = document.getElementById('open-user-permission-menu');
        const closeBtn = document.getElementById('pos-user-modal-close');
        const alertBanner = document.getElementById('pos-user-modal-alert');

        const tbody = document.getElementById('pos-user-admin-tbody');
        const btnAdd = document.getElementById('pos-user-btn-add');
        const btnEdit = document.getElementById('pos-user-btn-edit');
        const btnDel = document.getElementById('pos-user-btn-delete');
        const pinCheckbox = document.getElementById('pos-user-allow-pin-only');
        const selectedHint = document.getElementById('pos-user-selected-hint');

        const form = document.getElementById('pos-user-admin-form');
        const formTitle = document.getElementById('pos-user-form-title');
        const formBadge = document.getElementById('pos-user-form-badge');
        const idInput = document.getElementById('pos-user-id');
        const usernameInput = document.getElementById('pos-user-username');
        const passwordInput = document.getElementById('pos-user-password');
        const fullnameInput = document.getElementById('pos-user-fullname');
        const phoneInput = document.getElementById('pos-user-phone');
        const deptSelect = document.getElementById('pos-user-department');
        const areaInput = document.getElementById('pos-user-area');
        const areaHelpBtn = document.getElementById('pos-user-area-help-btn');
        const areaPopover = document.getElementById('pos-user-area-popover');
        const areaChips = document.getElementById('pos-user-area-chips');
        const btnCancel = document.getElementById('pos-user-btn-cancel');

        let usersData = [];
        let areasData = [];
        let selectedUserId = null;

        const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

        const escapeHtml = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const showAlert = (msg, type = 'success') => {
            if (!alertBanner) return;
            alertBanner.className = `menu-alert-banner ${type}`;
            alertBanner.textContent = msg;
            alertBanner.hidden = false;
            setTimeout(() => { alertBanner.hidden = true; }, 4000);
        };

        const appendLiveActivity = (log) => {
            if (!log) return;
            const scrollContainer = document.getElementById('pos-live-activity-scroll');
            if (!scrollContainer) return;
            const emptyRow = scrollContainer.querySelector('.empty-row');
            if (emptyRow) emptyRow.remove();
            const color = log.action_color || '#0284c7';
            const rowEl = document.createElement('div');
            rowEl.className = 'activity-row';
            rowEl.title = log.description || '';
            rowEl.innerHTML = `
                <time class="activity-time" style="font-weight: 600; color: ${color}; font-size: 11.5px;">${escapeHtml(log.time || '')}</time>
                <div>
                    <span class="activity-event-chip" style="background: ${color}18; color: ${color}; border: 1px solid ${color}40;">${escapeHtml(log.action_display || 'Hệ thống')}</span>
                </div>
                <span class="activity-detail" style="color: ${color}; font-weight: 500;">${escapeHtml(log.description || '')}</span>
                <strong class="activity-actor" style="color: ${color};">${escapeHtml(log.actor_name || '')}</strong>
            `;
            scrollContainer.prepend(rowEl);
        };

        const resetFormToAdd = (focusInput = false) => {
            if (!form) return;
            idInput.value = '';
            usernameInput.value = '';
            passwordInput.value = '';
            passwordInput.placeholder = 'Nhập mật khẩu...';
            fullnameInput.value = '';
            phoneInput.value = '';
            deptSelect.value = 'undefined';
            areaInput.value = 'ALL';
            if (formTitle) formTitle.textContent = 'Thêm người dùng';
            if (formBadge) {
                formBadge.textContent = 'Tạo mới';
                formBadge.classList.remove('mode-edit');
            }
            if (focusInput) usernameInput?.focus();
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
            if (formTitle) formTitle.textContent = 'Sửa người dùng';
            if (formBadge) {
                formBadge.textContent = `Đang sửa #${u.code}`;
                formBadge.classList.add('mode-edit');
            }
        };

        const renderAreaChips = () => {
            if (!areaChips) return;
            const list = ['ALL', ...areasData.filter(a => a && a.toUpperCase() !== 'ALL')];
            areaChips.innerHTML = list.map(a => `
                <button type="button" class="area-pick-chip ${(areaInput?.value || 'ALL') === a ? 'active' : ''}" data-area="${escapeHtml(a)}">
                    ${a === 'ALL' ? 'ALL (Tất cả khu vực)' : escapeHtml(a)}
                </button>
            `).join('');

            areaChips.querySelectorAll('.area-pick-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    if (areaInput) areaInput.value = chip.dataset.area;
                    areaChips.querySelectorAll('.area-pick-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    if (areaPopover) areaPopover.hidden = true;
                });
            });
        };

        const renderUsersTable = () => {
            if (!tbody) return;
            if (!usersData.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="activity-empty-notice">Chưa có người dùng nào trong hệ thống.</td></tr>';
                if (btnEdit) btnEdit.disabled = true;
                if (btnDel) btnDel.disabled = true;
                return;
            }

            tbody.innerHTML = usersData.map(u => `
                <tr class="user-admin-row ${selectedUserId === u.id ? 'selected' : ''}" data-id="${u.id}">
                    <td class="text-center"><strong>${u.code}</strong></td>
                    <td><strong>${escapeHtml(u.username)}</strong></td>
                    <td class="text-muted" style="letter-spacing: 1px;">######</td>
                    <td>${escapeHtml(u.full_name)}</td>
                    <td>${escapeHtml(u.phone)}</td>
                    <td><span class="user-dept-badge dept-${escapeHtml(u.department)}">${escapeHtml(u.department_display)}</span></td>
                    <td><code>${escapeHtml(u.area_code)}</code></td>
                </tr>
            `).join('');

            const selectedUser = usersData.find(x => x.id === selectedUserId);
            if (btnEdit) btnEdit.disabled = !selectedUser;
            if (btnDel) btnDel.disabled = !selectedUser;

            tbody.querySelectorAll('.user-admin-row').forEach(tr => {
                tr.addEventListener('click', () => {
                    selectedUserId = Number(tr.dataset.id);
                    tbody.querySelectorAll('.user-admin-row').forEach(r => r.classList.remove('selected'));
                    tr.classList.add('selected');
                    const u = usersData.find(x => x.id === selectedUserId);
                    if (btnEdit) btnEdit.disabled = !u;
                    if (btnDel) btnDel.disabled = !u;
                    if (u && selectedHint) {
                        selectedHint.innerHTML = `Đang chọn: <strong>${escapeHtml(u.username)}</strong> (${escapeHtml(u.full_name)} • ${escapeHtml(u.department_display)})`;
                    }
                });
                tr.addEventListener('dblclick', () => {
                    selectedUserId = Number(tr.dataset.id);
                    const u = usersData.find(x => x.id === selectedUserId);
                    if (u) {
                        populateFormForEdit(u);
                        fullnameInput?.focus();
                    }
                });
            });
        };

        const loadUsersData = async () => {
            try {
                const resp = await fetch('/accounts/api/users/');
                if (!resp.ok) throw new Error('Không thể tải danh sách người dùng.');
                const data = await resp.json();
                usersData = data.users || [];
                areasData = data.areas || [];
                if (pinCheckbox) {
                    pinCheckbox.checked = Boolean(data.allow_numeric_password_only);
                }
                if (!selectedUserId && usersData.length > 0) {
                    selectedUserId = usersData[0].id;
                }
                renderUsersTable();
                renderAreaChips();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        };

        const openUserAdminModal = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
            if (modal) {
                modal.hidden = false;
                resetFormToAdd(false);
                loadUsersData();
            }
        };

        openBtn1?.addEventListener('click', openUserAdminModal);

        closeBtn?.addEventListener('click', () => {
            if (modal) modal.hidden = true;
        });
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) modal.hidden = true;
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.hidden) {
                modal.hidden = true;
            }
        });

        btnAdd?.addEventListener('click', () => {
            resetFormToAdd(true);
        });

        btnEdit?.addEventListener('click', () => {
            const u = usersData.find(x => x.id === selectedUserId);
            if (!u) {
                showAlert('Vui lòng chọn một người dùng trong bảng để sửa.', 'error');
                return;
            }
            populateFormForEdit(u);
            fullnameInput?.focus();
        });

        btnCancel?.addEventListener('click', () => {
            resetFormToAdd(false);
        });

        btnDel?.addEventListener('click', async () => {
            const u = usersData.find(x => x.id === selectedUserId);
            if (!u) {
                showAlert('Vui lòng chọn người dùng cần xóa.', 'error');
                return;
            }
            if (!confirm(`Bạn có chắc chắn muốn xóa người dùng "${u.username}" (${u.full_name})?`)) return;

            try {
                const resp = await fetch(`/accounts/api/users/delete/${u.id}/`, {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Không thể xóa người dùng.');

                selectedUserId = null;
                resetFormToAdd(false);
                showAlert(res.message);
                if (res.activity_log) appendLiveActivity(res.activity_log);
                await loadUsersData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
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

            try {
                const resp = await fetch('/accounts/api/users/save/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify(payload),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Không thể lưu người dùng.');

                selectedUserId = res.user?.id || null;
                resetFormToAdd(false);
                showAlert(res.message);
                if (res.activity_log) appendLiveActivity(res.activity_log);
                await loadUsersData();
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        pinCheckbox?.addEventListener('change', async () => {
            try {
                const resp = await fetch('/accounts/api/users/config/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() },
                    body: JSON.stringify({ allow_numeric_password_only: pinCheckbox.checked }),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Lỗi lưu cấu hình.');
                showAlert(res.message);
                if (res.activity_log) appendLiveActivity(res.activity_log);
            } catch (err) {
                showAlert(err.message, 'error');
            }
        });

        areaHelpBtn?.addEventListener('click', () => {
            if (!areaPopover) return;
            renderAreaChips();
            areaPopover.hidden = !areaPopover.hidden;
        });
    })();
