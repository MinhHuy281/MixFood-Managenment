// # File này chịu trách nhiệm xử lý tương tác giao diện trang Đăng nhập Quản trị Admin (/admin/login/), bao gồm bật/tắt hiển thị mật khẩu.
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('btn-toggle-admin-pwd');
    const pwdInput = document.getElementById('admin-password');
    if (!toggleBtn || !pwdInput) return;

    toggleBtn.addEventListener('click', function() {
        const eyeOpen = this.querySelector('.eye-open');
        const eyeClosed = this.querySelector('.eye-closed');
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
});
