// # File này chịu trách nhiệm khởi tạo giao diện trang Báo cáo Xuất - Nhập - Tồn kho ở chế độ trang độc lập (Embedded Full-Page Mode).
document.addEventListener('DOMContentLoaded', () => {
        const modal = document.querySelector('#modal-inventory-manager');
        if (modal) {
            modal.hidden = false;
            modal.classList.remove('menu-modal-backdrop', 'inv-modal-backdrop');
            modal.classList.add('inv-embedded-page');
        }
    });
