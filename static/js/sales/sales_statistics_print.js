// # File này chịu trách nhiệm xử lý nút bấm In trang và tự động mở hộp thoại in khi trang Bảng kiểm bán hàng được mở với tham số auto=1.
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-print-action="print"]').forEach((btn) => {
        btn.addEventListener('click', () => window.print());
    });
});
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auto') === '1') {
        window.print();
    }
});
