// # File này chịu trách nhiệm xử lý các tương tác giao diện và gọi API trên các trang Quản trị Admin Mobile (/admin/users/, /admin/permissions/, /admin/inventory/, /admin/menu/, /admin/dining/).

document.addEventListener('DOMContentLoaded', function () {
    // # 1. TIỆN ÍCH LẤY CSRF TOKEN
    function getCsrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        if (match) return match[1];
        const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return input ? input.value : '';
    }

    // # 2. TIỆN ÍCH ĐÓNG / MỞ MODAL
    function openModal(modal) {
        if (!modal) return;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    // Bắt sự kiện nút đóng modal
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.admin-modal-backdrop');
            closeModal(modal);
        });
    });

    // Đóng khi click vào vùng ngoài backdrop
    document.querySelectorAll('.admin-modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', function (e) {
            if (e.target === this) {
                closeModal(this);
            }
        });
    });

    // # 3. QUẢN LÝ NGƯỜI DÙNG (/admin/users/)
    const modalUserForm = document.getElementById('modal-user-form');
    const formUserSave = document.getElementById('form-user-save');
    const btnOpenAddUser = document.getElementById('btn-open-add-user');

    if (btnOpenAddUser && modalUserForm) {
        btnOpenAddUser.addEventListener('click', function () {
            document.getElementById('modal-user-title').textContent = 'Thêm nhân viên mới';
            document.getElementById('inp-user-id').value = '';
            document.getElementById('inp-user-name').value = '';
            document.getElementById('inp-user-name').readOnly = false;
            document.getElementById('inp-user-fullname').value = '';
            document.getElementById('inp-user-password').value = '';
            document.getElementById('inp-user-password').required = true;
            document.getElementById('lbl-user-password').textContent = 'Mật khẩu (*)';
            document.getElementById('inp-user-phone').value = '';
            document.getElementById('inp-user-active').checked = true;
            openModal(modalUserForm);
        });
    }

    document.querySelectorAll('.btn-edit-user').forEach(btn => {
        btn.addEventListener('click', function () {
            const ds = this.dataset;
            document.getElementById('modal-user-title').textContent = `Sửa nhân viên: ${ds.username}`;
            document.getElementById('inp-user-id').value = ds.id || '';
            document.getElementById('inp-user-name').value = ds.username || '';
            document.getElementById('inp-user-name').readOnly = true;
            document.getElementById('inp-user-fullname').value = ds.fullname || '';
            document.getElementById('inp-user-password').value = '';
            document.getElementById('inp-user-password').required = false;
            document.getElementById('lbl-user-password').textContent = 'Đổi mật khẩu mới (để trống nếu giữ nguyên)';
            document.getElementById('inp-user-phone').value = ds.phone || '';
            if (document.getElementById('inp-user-dept')) {
                document.getElementById('inp-user-dept').value = ds.dept || 'Cashier';
            }
            document.getElementById('inp-user-active').checked = ds.active === '1';
            openModal(modalUserForm);
        });
    });

    if (formUserSave) {
        formUserSave.addEventListener('submit', async function (e) {
            e.preventDefault();
            const payload = {
                user_id: document.getElementById('inp-user-id').value || null,
                username: document.getElementById('inp-user-name').value.trim(),
                full_name: document.getElementById('inp-user-fullname').value.trim(),
                password: document.getElementById('inp-user-password').value,
                phone: document.getElementById('inp-user-phone').value.trim(),
                department: document.getElementById('inp-user-dept').value,
                is_active: document.getElementById('inp-user-active').checked
            };

            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';

            try {
                const res = await fetch('/admin/api/users/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.ok) {
                    alert(data.message || 'Thao tác thành công!');
                    window.location.reload();
                } else {
                    alert(data.message || 'Có lỗi xảy ra.');
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu tài khoản';
            }
        });
    }

    document.querySelectorAll('.btn-lock-user').forEach(btn => {
        btn.addEventListener('click', async function () {
            const uid = this.dataset.id;
            const uname = this.dataset.username;
            if (!confirm(`Bạn có chắc chắn muốn KHÓA tài khoản '${uname}' không?`)) return;

            try {
                const res = await fetch(`/admin/api/users/delete/${uid}/`, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCsrfToken()
                    }
                });
                const data = await res.json();
                if (data.ok) {
                    alert(data.message);
                    window.location.reload();
                } else {
                    alert(data.message || 'Không thể khóa tài khoản.');
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ: ' + err.message);
            }
        });
    });

    // # 4. PHÂN QUYỀN SỬ DỤNG 11 QUYỀN (/admin/permissions/)
    const permRoleTabs = document.getElementById('perm-role-tabs');
    const matrixEl = document.getElementById('matrix-data');
    const extraEl = document.getElementById('extra-data');
    const btnSavePerms = document.getElementById('btn-save-permissions');

    if (permRoleTabs && matrixEl && extraEl) {
        let currentRole = 'manager';
        let matrix = {};
        let extra = {};

        try {
            matrix = JSON.parse(matrixEl.textContent);
            extra = JSON.parse(extraEl.textContent);
        } catch (e) {
            console.error('Lỗi nạp cấu hình phân quyền', e);
        }

        const roleLabels = {
            'manager': 'Quản lý',
            'accountant': 'Kế toán',
            'cashier': 'Thu ngân',
            'kitchen': 'Chế biến',
            'waiter': 'Phục vụ'
        };

        function renderRolePermissions(roleKey) {
            currentRole = roleKey;
            const titleEl = document.getElementById('active-role-title');
            if (titleEl) {
                titleEl.textContent = roleLabels[roleKey] || roleKey;
            }

            const rolePerms = matrix[roleKey] || {};
            document.querySelectorAll('.perm-switch-input').forEach(input => {
                const permKey = input.dataset.perm;
                input.checked = !!rolePerms[permKey];
            });
        }

        // Khởi tạo trạng thái ban đầu
        renderRolePermissions(currentRole);

        // Khởi tạo các tùy chọn khóa tablet
        document.querySelectorAll('.extra-switch-input').forEach(input => {
            const extraKey = input.dataset.key;
            input.checked = !!extra[extraKey];
            input.addEventListener('change', function () {
                extra[extraKey] = this.checked;
            });
        });

        // Bắt sự kiện đổi tab vai trò
        permRoleTabs.querySelectorAll('.role-pill').forEach(pill => {
            pill.addEventListener('click', function () {
                permRoleTabs.querySelectorAll('.role-pill').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                renderRolePermissions(this.dataset.role);
            });
        });

        // Bắt sự kiện toggle quyền của vai trò hiện tại
        document.querySelectorAll('.perm-switch-input').forEach(input => {
            input.addEventListener('change', function () {
                const permKey = this.dataset.perm;
                if (!matrix[currentRole]) matrix[currentRole] = {};
                matrix[currentRole][permKey] = this.checked;
            });
        });

        // Lưu toàn bộ cấu hình 11 quyền
        if (btnSavePerms) {
            btnSavePerms.addEventListener('click', async function () {
                const origText = this.innerHTML;
                this.disabled = true;
                this.innerHTML = '<span>⏳ Đang lưu thiết lập...</span>';

                try {
                    const res = await fetch('/admin/api/permissions/save/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRFToken': getCsrfToken()
                        },
                        body: JSON.stringify({
                            permission_matrix: matrix,
                            extra_options: extra
                        })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        alert(data.message || 'Đã lưu cấu hình phân quyền thành công!');
                    } else {
                        alert(data.message || 'Có lỗi xảy ra khi lưu.');
                    }
                } catch (err) {
                    alert('Lỗi kết nối máy chủ: ' + err.message);
                } finally {
                    this.disabled = false;
                    this.innerHTML = origText;
                }
            });
        }
    }

    // # 5. QUẢN LÝ KHO HÀNG 3 KHU VỰC (/admin/inventory/)
    const modalStockForm = document.getElementById('modal-stock-form');
    const formStockSave = document.getElementById('form-stock-save');

    document.querySelectorAll('.btn-edit-stock').forEach(btn => {
        btn.addEventListener('click', function () {
            const ds = this.dataset;
            document.getElementById('inp-stock-id').value = ds.id || '';
            document.getElementById('disp-stock-name').textContent = ds.name || '';
            document.getElementById('disp-stock-unit').textContent = ds.unit || 'ĐVT';
            document.getElementById('inp-stock-current').value = ds.stock || '0';
            document.getElementById('inp-stock-min').value = ds.min || '0';
            openModal(modalStockForm);
        });
    });

    if (formStockSave) {
        formStockSave.addEventListener('submit', async function (e) {
            e.preventDefault();
            const payload = {
                item_id: document.getElementById('inp-stock-id').value,
                current_stock: document.getElementById('inp-stock-current').value,
                minimum_stock: document.getElementById('inp-stock-min').value
            };

            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';

            try {
                const res = await fetch('/admin/api/inventory/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.ok) {
                    alert(data.message);
                    window.location.reload();
                } else {
                    alert(data.message || 'Lỗi khi cập nhật tồn kho.');
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Xác nhận điều chỉnh';
            }
        });
    }

    // # 6. THỰC ĐƠN & BẢNG GIÁ MÓN (/admin/menu/)
    const modalMenuForm = document.getElementById('modal-menu-form');
    const formMenuSave = document.getElementById('form-menu-save');

    document.querySelectorAll('.btn-edit-dish').forEach(btn => {
        btn.addEventListener('click', function () {
            const ds = this.dataset;
            document.getElementById('inp-menu-id').value = ds.id || '';
            document.getElementById('inp-menu-name').value = ds.name || '';
            document.getElementById('inp-menu-price').value = ds.price || '0';
            document.getElementById('inp-menu-price2').value = ds.price2 || '';
            document.getElementById('inp-menu-price3').value = ds.price3 || '';
            document.getElementById('inp-menu-available').checked = ds.available === '1';
            openModal(modalMenuForm);
        });
    });

    if (formMenuSave) {
        formMenuSave.addEventListener('submit', async function (e) {
            e.preventDefault();
            const payload = {
                product_id: document.getElementById('inp-menu-id').value,
                name: document.getElementById('inp-menu-name').value.trim(),
                price: document.getElementById('inp-menu-price').value,
                price_2: document.getElementById('inp-menu-price2').value,
                price_3: document.getElementById('inp-menu-price3').value,
                is_available: document.getElementById('inp-menu-available').checked
            };

            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';

            try {
                const res = await fetch('/admin/api/menu/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.ok) {
                    alert(data.message);
                    window.location.reload();
                } else {
                    alert(data.message || 'Lỗi khi lưu món ăn.');
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu thay đổi';
            }
        });
    }

    // # 7. KHU VỰC & BÀN ĂN (/admin/dining/)
    const modalTableForm = document.getElementById('modal-table-form');
    const formTableSave = document.getElementById('form-table-save');
    const btnOpenAddTable = document.getElementById('btn-open-add-table');

    if (btnOpenAddTable && modalTableForm) {
        btnOpenAddTable.addEventListener('click', function () {
            document.getElementById('modal-table-title').textContent = 'Thêm bàn ăn mới';
            document.getElementById('inp-table-id').value = '';
            document.getElementById('inp-table-name').value = '';
            document.getElementById('inp-table-capacity').value = '4';
            document.getElementById('inp-table-status').value = 'available';
            openModal(modalTableForm);
        });
    }

    document.querySelectorAll('.btn-edit-table').forEach(btn => {
        btn.addEventListener('click', function () {
            const ds = this.dataset;
            document.getElementById('modal-table-title').textContent = `Sửa bàn: ${ds.name}`;
            document.getElementById('inp-table-id').value = ds.id || '';
            document.getElementById('inp-table-name').value = ds.name || '';
            if (document.getElementById('inp-table-area')) {
                document.getElementById('inp-table-area').value = ds.area || '';
            }
            document.getElementById('inp-table-capacity').value = ds.capacity || '4';
            document.getElementById('inp-table-status').value = ds.status || 'available';
            openModal(modalTableForm);
        });
    });

    if (formTableSave) {
        formTableSave.addEventListener('submit', async function (e) {
            e.preventDefault();
            const payload = {
                table_id: document.getElementById('inp-table-id').value || null,
                name: document.getElementById('inp-table-name').value.trim(),
                area_id: document.getElementById('inp-table-area').value,
                capacity: document.getElementById('inp-table-capacity').value,
                status: document.getElementById('inp-table-status').value
            };

            const submitBtn = this.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';

            try {
                const res = await fetch('/admin/api/dining/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data.ok) {
                    alert(data.message);
                    window.location.reload();
                } else {
                    alert(data.message || 'Lỗi khi lưu bàn.');
                }
            } catch (err) {
                alert('Lỗi kết nối máy chủ: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu thông tin bàn';
            }
        });
    }
});
