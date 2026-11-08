// # File này chịu trách nhiệm xử lý nút in báo cáo, nút đóng cửa sổ và tự động mở hộp thoại máy in (window.print) trên trang in Báo cáo cuối ngày.
window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-print-action="print"]').forEach((btn) => {
        btn.addEventListener('click', () => window.print());
    });
    document.querySelectorAll('[data-print-action="close"]').forEach((btn) => {
        btn.addEventListener('click', () => window.close());
    });
});
window.addEventListener('load', () => {
    window.setTimeout(() => {
        window.print();
    }, 250);
});
