// # File này chịu trách nhiệm xử lý các tính năng nâng cao trên trang Đăng nhập hệ thống: Hiện/ẩn mật khẩu, Hộp thoại Đổi mật khẩu, Hộp thoại Quên mật khẩu và Hộp thoại Đăng ký nhân viên mới.
document.addEventListener('DOMContentLoaded', () => {
    // 1. Chế độ đăng nhập nhanh bằng số
    const form = document.querySelector('.login-form');
    if (form && form.dataset.allowNumericOnly === '1') {
        const uInput = document.getElementById('id_username');
        if (uInput) uInput.removeAttribute('required');
    }

    // 2. Toggle Hiện / Ẩn Mật khẩu trang Đăng nhập chính
    const togglePwdBtn = document.getElementById('btn-toggle-login-pwd');
    const pwdInput = document.getElementById('id_password');
    const userInput = document.getElementById('id_username');

    if (togglePwdBtn && pwdInput) {
        togglePwdBtn.addEventListener('click', () => {
            const eyeOpen = togglePwdBtn.querySelector('.eye-open');
            const eyeClosed = togglePwdBtn.querySelector('.eye-closed');
            if (pwdInput.type === 'password') {
                pwdInput.type = 'text';
                if (eyeOpen) eyeOpen.style.display = 'none';
                if (eyeClosed) eyeClosed.style.display = 'inline-block';
            } else {
                pwdInput.type = 'password';
                if (eyeOpen) eyeOpen.style.display = 'inline-block';
                if (eyeClosed) eyeClosed.style.display = 'none';
            }
        });
    }

    // Toggle Hiện / Ẩn Mật khẩu trong các ô Modal
    document.querySelectorAll('.btn-toggle-modal-pwd').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            if (!targetInput) return;
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');
            if (targetInput.type === 'password') {
                targetInput.type = 'text';
                if (eyeOpen) eyeOpen.style.display = 'none';
                if (eyeClosed) eyeClosed.style.display = 'inline-block';
            } else {
                targetInput.type = 'password';
                if (eyeOpen) eyeOpen.style.display = 'inline-block';
                if (eyeClosed) eyeClosed.style.display = 'none';
            }
        });
    });

    const csrfToken = () => document.querySelector('[name="csrfmiddlewaretoken"]')?.value || '';

    const showAlert = (el, msg, type = 'error') => {
        if (!el) return;
        el.className = `menu-alert-banner ${type}`;
        el.textContent = msg;
        el.hidden = false;
        setTimeout(() => { el.hidden = true; }, 4500);
    };

    // 3. Modal Đổi Mật Khẩu
    const modalChange = document.getElementById('modal-change-password');
    const btnOpenChange = document.getElementById('btn-open-change-pwd');
    const btnCloseChange = document.getElementById('btn-close-change-pwd');
    const btnCancelChange = document.getElementById('btn-cancel-change-pwd');
    const formChange = document.getElementById('form-change-pwd');
    const alertChange = document.getElementById('change-pwd-alert');
    const submitChange = document.getElementById('btn-submit-change-pwd');

    const openChangeModal = () => {
        if (alertChange) alertChange.hidden = true;
        if (formChange) formChange.reset();
        if (userInput && userInput.value) {
            const cpUser = document.getElementById('cp-username');
            if (cpUser) cpUser.value = userInput.value;
        }
        if (modalChange) modalChange.hidden = false;
        setTimeout(() => {
            const cpOld = document.getElementById('cp-old-password');
            if (cpOld) cpOld.focus();
        }, 50);
    };

    const closeChangeModal = () => {
        if (modalChange) modalChange.hidden = true;
    };

    btnOpenChange?.addEventListener('click', openChangeModal);
    btnCloseChange?.addEventListener('click', closeChangeModal);
    btnCancelChange?.addEventListener('click', closeChangeModal);

    formChange?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('cp-username')?.value.trim();
        const oldPassword = document.getElementById('cp-old-password')?.value;
        const newPassword = document.getElementById('cp-new-password')?.value;
        const confirmPassword = document.getElementById('cp-confirm-password')?.value;

        if (newPassword !== confirmPassword) {
            showAlert(alertChange, 'Mật khẩu xác nhận không khớp với mật khẩu mới.', 'error');
            return;
        }

        if (submitChange) {
            submitChange.disabled = true;
            submitChange.textContent = 'Đang xử lý...';
        }

        try {
            const resp = await fetch('/accounts/api/change-password/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken(),
                },
                body: JSON.stringify({
                    username,
                    old_password: oldPassword,
                    new_password: newPassword,
                }),
            });
            const data = await resp.json();
            if (resp.ok && data.ok) {
                showAlert(alertChange, data.message, 'success');
                if (userInput) userInput.value = username;
                if (pwdInput) pwdInput.value = newPassword;
                setTimeout(() => {
                    closeChangeModal();
                    pwdInput?.focus();
                }, 1300);
            } else {
                showAlert(alertChange, data.message || 'Đổi mật khẩu thất bại.', 'error');
            }
        } catch (err) {
            showAlert(alertChange, 'Lỗi kết nối máy chủ. Vui lòng thử lại.', 'error');
        } finally {
            if (submitChange) {
                submitChange.disabled = false;
                submitChange.textContent = 'Xác nhận đổi mật khẩu';
            }
        }
    });

    // 4. Modal Quên Mật Khẩu
    const modalForgot = document.getElementById('modal-forgot-password');
    const btnOpenForgot = document.getElementById('btn-open-forgot-pwd');
    const btnCloseForgot = document.getElementById('btn-close-forgot-pwd');
    const btnCancelForgot = document.getElementById('btn-cancel-forgot-pwd');
    const formForgot = document.getElementById('form-forgot-pwd');
    const alertForgot = document.getElementById('forgot-pwd-alert');
    const submitForgot = document.getElementById('btn-submit-forgot-pwd');

    const openForgotModal = () => {
        if (alertForgot) alertForgot.hidden = true;
        if (formForgot) formForgot.reset();
        if (userInput && userInput.value) {
            const fpUser = document.getElementById('fp-username');
            if (fpUser) fpUser.value = userInput.value;
        }
        if (modalForgot) modalForgot.hidden = false;
        setTimeout(() => document.getElementById('fp-username')?.focus(), 50);
    };

    const closeForgotModal = () => {
        if (modalForgot) modalForgot.hidden = true;
    };

    btnOpenForgot?.addEventListener('click', openForgotModal);
    btnCloseForgot?.addEventListener('click', closeForgotModal);
    btnCancelForgot?.addEventListener('click', closeForgotModal);

    formForgot?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('fp-username')?.value.trim();
        const phone = document.getElementById('fp-phone')?.value.trim();
        const newPassword = document.getElementById('fp-new-password')?.value;
        const confirmPassword = document.getElementById('fp-confirm-password')?.value;

        if (newPassword !== confirmPassword) {
            showAlert(alertForgot, 'Mật khẩu xác nhận không khớp.', 'error');
            return;
        }

        if (submitForgot) {
            submitForgot.disabled = true;
            submitForgot.textContent = 'Đang xử lý...';
        }

        try {
            const resp = await fetch('/accounts/api/forgot-password/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken(),
                },
                body: JSON.stringify({
                    username,
                    phone,
                    new_password: newPassword,
                }),
            });
            const data = await resp.json();
            if (resp.ok && data.ok) {
                showAlert(alertForgot, data.message, 'success');
                if (userInput) userInput.value = username;
                if (pwdInput) pwdInput.value = newPassword;
                setTimeout(() => {
                    closeForgotModal();
                    pwdInput?.focus();
                }, 1200);
            } else {
                showAlert(alertForgot, data.message || 'Đặt lại mật khẩu thất bại.', 'error');
            }
        } catch (err) {
            showAlert(alertForgot, 'Lỗi kết nối máy chủ. Vui lòng thử lại.', 'error');
        } finally {
            if (submitForgot) {
                submitForgot.disabled = false;
                submitForgot.textContent = 'Xác nhận đặt lại';
            }
        }
    });

    // 5. Modal Đăng ký tài khoản nhân viên mới
    const modalRegister = document.getElementById('modal-register-user');
    const btnOpenRegister = document.getElementById('btn-open-register');
    const btnCloseRegister = document.getElementById('btn-close-register-user');
    const btnCancelRegister = document.getElementById('btn-cancel-register-user');
    const formRegister = document.getElementById('form-register-user');
    const alertRegister = document.getElementById('register-user-alert');
    const submitRegister = document.getElementById('btn-submit-register-user');

    const openRegisterModal = () => {
        if (alertRegister) alertRegister.hidden = true;
        if (formRegister) formRegister.reset();
        if (modalRegister) modalRegister.hidden = false;
        setTimeout(() => document.getElementById('reg-fullname')?.focus(), 50);
    };

    const closeRegisterModal = () => {
        if (modalRegister) modalRegister.hidden = true;
    };

    btnOpenRegister?.addEventListener('click', openRegisterModal);
    btnCloseRegister?.addEventListener('click', closeRegisterModal);
    btnCancelRegister?.addEventListener('click', closeRegisterModal);

    formRegister?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('reg-fullname')?.value.trim();
        const username = document.getElementById('reg-username')?.value.trim();
        const password = document.getElementById('reg-password')?.value;
        const phone = document.getElementById('reg-phone')?.value.trim();
        const department = document.getElementById('reg-department')?.value;

        if (submitRegister) {
            submitRegister.disabled = true;
            submitRegister.textContent = 'Đang đăng ký...';
        }

        try {
            const resp = await fetch('/accounts/api/register/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken(),
                },
                body: JSON.stringify({
                    full_name: fullName,
                    username,
                    password,
                    phone,
                    department,
                }),
            });
            const data = await resp.json();
            if (resp.ok && data.ok) {
                showAlert(alertRegister, data.message, 'success');
                if (userInput) userInput.value = username;
                if (pwdInput) pwdInput.value = password;
                setTimeout(() => {
                    closeRegisterModal();
                    pwdInput?.focus();
                }, 1400);
            } else {
                showAlert(alertRegister, data.message || 'Đăng ký thất bại.', 'error');
            }
        } catch (err) {
            showAlert(alertRegister, 'Lỗi kết nối máy chủ. Vui lòng thử lại.', 'error');
        } finally {
            if (submitRegister) {
                submitRegister.disabled = false;
                submitRegister.textContent = 'Đăng ký tài khoản';
            }
        }
    });
});
