// # File này chịu trách nhiệm xử lý tự động gửi biểu mẫu bộ lọc (auto-submit) khi thay đổi ngày, hành động hoặc nhân viên trên trang Nhật ký hoạt động.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-auto-submit="1"]').forEach((el) => {
        el.addEventListener('change', () => {
            if (el.form) el.form.submit();
        });
    });
});
