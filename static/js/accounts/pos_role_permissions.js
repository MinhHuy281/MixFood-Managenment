// # File này chịu trách nhiệm xử lý hộp thoại Phân quyền sử dụng theo vai trò (Role Permission Modal), Tùy chọn hệ thống và kiểm tra quyền hạn thao tác trên POS.
// =========================================================================
    // POS ROLE PERMISSION & PERMISSION REQUEST (YÊU CẦU QUYỀN HẠN) CONTROLLER
    // =========================================================================
    (() => {
        let userPermissions = {};
        let extraOptions = {};
        try {
            userPermissions = JSON.parse(document.getElementById('pos-user-permissions-data')?.textContent || '{}');
        } catch (e) {
            userPermissions = {};
        }
        try {
            extraOptions = JSON.parse(document.getElementById('pos-extra-options-data')?.textContent || '{}');
        } catch (e) {
            extraOptions = {};
        }

        const permModal = document.getElementById('pos-role-permission-modal');
        const permOpenBtn = document.getElementById('open-user-permission-menu');
        const permCloseBtn = document.getElementById('pos-role-perm-modal-close');
        const permSaveBtn = document.getElementById('pos-perm-btn-save');
        const permCancelBtn = document.getElementById('pos-perm-btn-cancel');
        const permAlert = document.getElementById('pos-role-perm-modal-alert');
        const permTable = document.getElementById('pos-role-permission-table');

        const reqModal = document.getElementById('pos-permission-request-modal');
        const reqCloseBtn = document.getElementById('pos-perm-req-modal-close');
        const reqCancelBtn = document.getElementById('pos-perm-req-cancel');
        const reqForm = document.getElementById('pos-perm-req-form');
        const reqUsernameInput = document.getElementById('pos-perm-req-username');
        const reqPasswordInput = document.getElementById('pos-perm-req-password');
        const reqSubmitBtn = document.getElementById('pos-perm-req-submit');
        const reqAlert = document.getElementById('pos-perm-req-alert');
        const reqHint = document.getElementById('pos-perm-req-feature-hint');

        let pendingCallback = null;
        let pendingPermissionKey = '';
        let pendingFeatureLabel = '';
        let isTemporarilyElevated = false;

        const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

        const showPermAlert = (el, msg, type = 'error') => {
            if (!el) return;
            el.className = `menu-alert-banner ${type}`;
            el.textContent = msg;
            el.hidden = false;
            setTimeout(() => { el.hidden = true; }, 4200);
        };

        const applyExtraOptionsToUI = () => {
            const closingDialog = document.getElementById('closing-dialog');
            if (closingDialog) {
                closingDialog.classList.toggle('hide-closing-numbers', Boolean(extraOptions.hide_shift_close_numbers));
            }
            const dialogPrice = document.getElementById('dialog-price');
            if (dialogPrice) {
                const canEditPrice = Boolean(userPermissions.edit_item_price) && !Boolean(extraOptions.lock_edit_price_all_roles);
                dialogPrice.readOnly = !canEditPrice;
                dialogPrice.title = canEditPrice
                    ? 'Nhập giá món tùy chỉnh'
                    : (extraOptions.lock_edit_price_all_roles ? 'Đã khóa sửa giá món cho mọi cấp bậc' : 'Nhấp để xác thực quyền sửa giá món');
            }
        };

        applyExtraOptionsToUI();

        window.posHasPermission = (permKey) => {
            if (!permKey) return true;
            if (isTemporarilyElevated) return true;
            if (permKey === 'edit_item_price' && extraOptions.lock_edit_price_all_roles) {
                return false;
            }
            return Boolean(userPermissions[permKey]);
        };

        window.posGetExtraOption = (optKey) => Boolean(extraOptions[optKey]);

        const clearServerElevation = async () => {
            if (!isTemporarilyElevated) return;
            isTemporarilyElevated = false;
            try {
                await fetch('/accounts/api/permissions/clear-elevation/', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken() },
                });
            } catch (err) {
                // Ignore network error on cleanup
            }
        };
        window.clearPosElevation = clearServerElevation;

        // Open "Yêu cầu quyền hạn" dialog
        const openPermissionRequestModal = (permKey, callback, featureLabel = '') => {
            pendingPermissionKey = permKey || '';
            pendingCallback = typeof callback === 'function' ? callback : null;
            pendingFeatureLabel = featureLabel || '';

            if (reqAlert) reqAlert.hidden = true;
            if (reqHint) {
                if (featureLabel) {
                    reqHint.textContent = `Chức năng: ${featureLabel}`;
                    reqHint.hidden = false;
                } else {
                    reqHint.textContent = '';
                    reqHint.hidden = true;
                }
            }
            if (reqUsernameInput) reqUsernameInput.value = '';
            if (reqPasswordInput) reqPasswordInput.value = '';
            if (reqSubmitBtn) {
                reqSubmitBtn.disabled = false;
                reqSubmitBtn.textContent = 'Xác thực';
            }
            if (reqModal) {
                reqModal.hidden = false;
                setTimeout(() => reqUsernameInput?.focus(), 40);
            }
        };

        const closePermissionRequestModal = () => {
            if (reqModal) reqModal.hidden = true;
            pendingCallback = null;
            pendingPermissionKey = '';
            pendingFeatureLabel = '';
        };

        window.requirePosPermission = (permKey, callback, featureLabel = '') => {
            if (window.posHasPermission(permKey)) {
                if (typeof callback === 'function') callback();
                return true;
            }
            openPermissionRequestModal(permKey, callback, featureLabel);
            return false;
        };

        reqCloseBtn?.addEventListener('click', closePermissionRequestModal);
        reqCancelBtn?.addEventListener('click', closePermissionRequestModal);
        reqModal?.addEventListener('click', (e) => {
            if (e.target === reqModal) closePermissionRequestModal();
        });

        reqForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = (reqUsernameInput?.value || '').trim();
            const password = (reqPasswordInput?.value || '').trim();
            if (!username || !password) {
                showPermAlert(reqAlert, 'Vui lòng nhập đầy đủ Tên truy cập và Mật khẩu.', 'error');
                return;
            }

            if (reqSubmitBtn) {
                reqSubmitBtn.disabled = true;
                reqSubmitBtn.textContent = 'Đang xác thực...';
            }

            try {
                const resp = await fetch('/accounts/api/permissions/verify/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken(),
                    },
                    body: JSON.stringify({
                        username,
                        password,
                        required_permission: pendingPermissionKey,
                        feature_label: pendingFeatureLabel,
                    }),
                });
                const res = await resp.json();
                if (!resp.ok) {
                    throw new Error(res.error || 'Xác thực không thành công.');
                }

                isTemporarilyElevated = true;
                if (res.activity_log && typeof window.prependPosLiveActivityLog === 'function') {
                    window.prependPosLiveActivityLog(res.activity_log);
                }

                const cb = pendingCallback;
                closePermissionRequestModal();
                if (typeof cb === 'function') {
                    cb();
                }
            } catch (err) {
                showPermAlert(reqAlert, err.message, 'error');
                if (reqSubmitBtn) {
                    reqSubmitBtn.disabled = false;
                    reqSubmitBtn.textContent = 'Xác thực';
                }
                reqPasswordInput?.select();
            }
        });

        // =====================================================================
        // PHÂN QUYỀN SỬ DỤNG - ADMIN MODAL LOGIC
        // =====================================================================
        const populatePermissionMatrixUI = (matrix, extra) => {
            if (permTable && matrix) {
                permTable.querySelectorAll('input[type="checkbox"][data-role][data-perm]').forEach((cb) => {
                    const role = cb.dataset.role;
                    const perm = cb.dataset.perm;
                    if (role === 'admin') {
                        cb.checked = true;
                        cb.disabled = true;
                    } else {
                        cb.checked = Boolean(matrix[role]?.[perm]);
                    }
                });
            }
            if (permModal && extra) {
                permModal.querySelectorAll('input[type="checkbox"][data-extra-opt]').forEach((cb) => {
                    const optKey = cb.dataset.extraOpt;
                    cb.checked = Boolean(extra[optKey]);
                });
            }
        };

        const loadPermissionsConfig = async () => {
            try {
                const resp = await fetch('/accounts/api/permissions/');
                if (!resp.ok) throw new Error('Không thể tải thiết lập phân quyền.');
                const data = await resp.json();
                populatePermissionMatrixUI(data.permission_matrix, data.extra_options);
                if (data.current_user?.permissions) {
                    userPermissions = data.current_user.permissions;
                }
                if (data.extra_options) {
                    extraOptions = data.extra_options;
                }
                applyExtraOptionsToUI();
            } catch (err) {
                showPermAlert(permAlert, err.message, 'error');
            }
        };

        const openRolePermissionModal = () => {
            document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
            if (permAlert) permAlert.hidden = true;
            if (permModal) {
                permModal.hidden = false;
                loadPermissionsConfig();
            }
        };

        const closeRolePermissionModal = () => {
            if (permModal) permModal.hidden = true;
        };

        permOpenBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
            window.requirePosPermission('super_admin', openRolePermissionModal, 'Phân quyền sử dụng');
        });

        permCloseBtn?.addEventListener('click', closeRolePermissionModal);
        permCancelBtn?.addEventListener('click', closeRolePermissionModal);
        permModal?.addEventListener('click', (e) => {
            if (e.target === permModal) closeRolePermissionModal();
        });

        permSaveBtn?.addEventListener('click', async () => {
            const matrixPayload = {};
            permTable?.querySelectorAll('input[type="checkbox"][data-role][data-perm]').forEach((cb) => {
                const role = cb.dataset.role;
                const perm = cb.dataset.perm;
                if (!matrixPayload[role]) matrixPayload[role] = {};
                matrixPayload[role][perm] = role === 'admin' ? true : Boolean(cb.checked);
            });

            const extraPayload = {};
            permModal?.querySelectorAll('input[type="checkbox"][data-extra-opt]').forEach((cb) => {
                extraPayload[cb.dataset.extraOpt] = Boolean(cb.checked);
            });

            permSaveBtn.disabled = true;
            try {
                const resp = await fetch('/accounts/api/permissions/save/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': csrfToken(),
                    },
                    body: JSON.stringify({
                        permission_matrix: matrixPayload,
                        extra_options: extraPayload,
                    }),
                });
                const res = await resp.json();
                if (!resp.ok) throw new Error(res.error || 'Không thể lưu phân quyền.');

                if (res.current_user_permissions) {
                    userPermissions = res.current_user_permissions;
                }
                if (res.extra_options) {
                    extraOptions = res.extra_options;
                }
                applyExtraOptionsToUI();
                if (res.activity_log && typeof window.prependPosLiveActivityLog === 'function') {
                    window.prependPosLiveActivityLog(res.activity_log);
                }
                closeRolePermissionModal();
                const sysNotice = document.getElementById('system-notice');
                if (sysNotice) {
                    sysNotice.textContent = res.message || 'Đã lưu thiết lập phân quyền sử dụng.';
                    sysNotice.hidden = false;
                    setTimeout(() => { sysNotice.hidden = true; }, 3800);
                }
            } catch (err) {
                showPermAlert(permAlert, err.message, 'error');
            } finally {
                permSaveBtn.disabled = false;
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (reqModal && !reqModal.hidden) {
                    closePermissionRequestModal();
                } else if (permModal && !permModal.hidden) {
                    closeRolePermissionModal();
                }
            }
        });

        // =====================================================================
        // GUARD RESTRICTED TOP-BAR MENUS & ACTIONS IN CAPTURE PHASE
        // =====================================================================
        const guardElementWithPermission = (selector, permKey, labelText) => {
            document.querySelectorAll(selector).forEach((el) => {
                el.addEventListener('click', (e) => {
                    if (el.dataset.elevatedOnce === '1') {
                        delete el.dataset.elevatedOnce;
                        return;
                    }
                    if (window.posHasPermission(permKey)) {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    document.querySelectorAll('.pos-menu-item').forEach(m => m.classList.remove('open'));
                    document.querySelectorAll('.nav-menu-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));

                    const featureName = labelText || (el.textContent || '').trim();
                    openPermissionRequestModal(permKey, () => {
                        el.dataset.elevatedOnce = '1';
                        el.click();
                    }, featureName);
                }, true);
            });
        };

        // 1. Quản trị cao cấp (super_admin)
        guardElementWithPermission('#open-user-admin-menu', 'super_admin', 'Người dùng hệ thống');

        // 2. Thiết lập hệ thống (system_settings)
        guardElementWithPermission('#open-activity-admin-menu', 'system_settings', 'Nhật ký hoạt động');
        guardElementWithPermission('.system-action[data-action="maintenance"]', 'system_settings', 'Bảo trì dữ liệu');
        guardElementWithPermission('.system-action[data-action="device"]', 'system_settings', 'Thiết bị POS');

        // 3. Cài đặt kinh doanh (business_settings)
        guardElementWithPermission('#open-dining-admin-menu', 'business_settings', 'Khu vực - Điểm bán');
        guardElementWithPermission('.empty-sidebar-panel .btn-setup', 'business_settings', 'Thiết lập khu vực');
        guardElementWithPermission('#open-menu-admin-menu', 'business_settings', 'Thực đơn (món bán → khách)');
        guardElementWithPermission('.settings-action[data-setting="price-policy"]', 'business_settings', 'Chính sách giá & Sự kiện');
        guardElementWithPermission('.settings-action[data-setting="coupon"]', 'business_settings', 'Mã giảm giá & Coupon');
        guardElementWithPermission('.settings-action[data-setting="options"]', 'business_settings', 'Các tùy chọn POS');

        // 4. Quản lý kho, nguyên liệu (manage_inventory)
        guardElementWithPermission('#open-ingredient-admin-menu', 'manage_inventory', 'Mặt hàng - Admin');
        guardElementWithPermission('#open-recipe-admin-menu', 'manage_inventory', 'Định lượng nguyên liệu');
        guardElementWithPermission('.management-menu a[href*="inventory"]', 'manage_inventory', 'Quản lý kho hàng');
        guardElementWithPermission('.reports-menu a[href*="inventory"]', 'manage_inventory', 'Xuất nhập tồn kho');
        guardElementWithPermission('.report-action[data-report="purchases"]', 'manage_inventory', 'Hoạt động mua hàng');

        // 5. Quản lý thu chi, tiền mặt (manage_cashbook)
        guardElementWithPermission('.management-action[data-management="cashbook"]', 'manage_cashbook', 'Sổ thu chi tiền mặt');
        guardElementWithPermission('.management-action[data-management="debt"]', 'manage_cashbook', 'Quản lý công nợ');
        guardElementWithPermission('.report-action[data-report="cash"]', 'manage_cashbook', 'Thống kê các khoản tiền');

        // 6. Quản lý nhân viên, ca (manage_staff_shift)
        guardElementWithPermission('.management-menu a[href*="dining"], .management-action[data-management="shift_assign"]', 'manage_staff_shift', 'Phân công bàn ca');
        guardElementWithPermission('.management-menu a[href*="invoices"], .management-action[data-management="shift_invoices"]', 'manage_staff_shift', 'Sổ hóa đơn kết ca');

        // 6b. Quản lý kho hàng & Xuất Nhập Tồn (manage_inventory)
        guardElementWithPermission('#open-inventory-manager-menu, #open-inventory-report-menu', 'manage_inventory', 'Quản lý kho hàng & Xuất Nhập Tồn');

        // 7. Quản lý khách hàng (manage_customers)
        guardElementWithPermission('.management-action[data-management="customers"]', 'manage_customers', 'Danh sách khách hàng');
        guardElementWithPermission('.report-action[data-report="customer-revenue"]', 'manage_customers', 'Doanh thu theo khách');

        // 8. Xem báo cáo bán hàng (view_sales_report)
        guardElementWithPermission('#open-guest-count-menu, .report-action[data-report="guest-count"]', 'view_sales_report', 'Lượng khách hôm nay');
        guardElementWithPermission('#open-invoice-report-menu', 'view_sales_report', 'Hóa đơn thanh toán');
        guardElementWithPermission('#open-invoice-report-menu-detail', 'view_sales_report', 'Hàng bán chi tiết');
        guardElementWithPermission('#open-revenue-time-menu', 'view_sales_report', 'Doanh thu (Theo thời gian)');
        guardElementWithPermission('#open-sales-stats-menu', 'view_sales_report', 'Thống kê bán hàng');
        guardElementWithPermission('#open-end-of-day-report-menu', 'view_sales_report', 'Báo cáo cuối ngày');
        guardElementWithPermission('.reports-menu a[href*="reports"]:not(#open-revenue-time-menu):not(#open-end-of-day-report-menu)', 'view_sales_report', 'Báo cáo doanh thu');

        // 9. Tự động thu hồi quyền nâng cấp tạm thời khi đóng các modal chức năng
        // (Đảm bảo sau khi dùng xong chức năng và thoát ra, phiên làm việc vẫn là tài khoản ban đầu)
        const trackedModalIds = [
            'pos-role-permission-modal',
            'pos-user-admin-modal',
            'pos-activity-admin-modal',
            'pos-dining-admin-modal',
            'pos-menu-admin-modal',
            'pos-ingredient-admin-modal',
            'pos-recipe-admin-modal',
            'invoice-report-dialog',
            'sales-stats-modal',
            'modal-sales-statistics',
            'modal-revenue-by-time',
            'modal-guest-count-today',
            'modal-end-of-day-report',
            'modal-coupon-manager',
            'modal-inventory-manager',
            'modal-inv-new-receipt',
            'modal-inv-new-issue',
            'modal-inv-view-slip',
            'modal-pos-feature-hub',
            'invoice-edit-modal',
            'invoice-delete-dialog',
        ];

        const areAllTrackedModalsHidden = () => {
            return trackedModalIds.every((id) => {
                const el = document.getElementById(id);
                return !el || el.hidden;
            });
        };

        const modalObserver = new MutationObserver(() => {
            if (isTemporarilyElevated && areAllTrackedModalsHidden()) {
                clearServerElevation();
            }
        });

        trackedModalIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                modalObserver.observe(el, { attributes: true, attributeFilter: ['hidden'] });
            }
        });
    })();
