// # File này chịu trách nhiệm khởi tạo giao diện trang Quản lý Kho hàng (Tách Thùng -> Hộp / Suất chờ bán) ở chế độ trang độc lập.
document.addEventListener('DOMContentLoaded', () => {
        const modal = document.querySelector('#modal-inventory-manager');
        if (modal) {
            modal.hidden = false;
            modal.classList.remove('menu-modal-backdrop', 'inv-modal-backdrop');
            modal.classList.add('inv-embedded-page');
        }
        if (typeof window.openPosInventoryModal === 'function') {
            window.openPosInventoryModal('unpack');
        }
    });
