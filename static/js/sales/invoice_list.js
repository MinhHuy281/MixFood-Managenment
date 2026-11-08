// # File này chịu trách nhiệm xử lý sự kiện trên trang Danh sách Hóa đơn: mở hộp thoại chỉnh sửa hóa đơn khi nhấp đúp hoặc bấm nút sửa.
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.invoice-row-clickable').forEach(tr => {
        const code = tr.dataset.code;
        tr.addEventListener('dblclick', () => {
            if (window.openInvoiceEditor) window.openInvoiceEditor(code);
        });
        tr.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (window.openInvoiceEditor) window.openInvoiceEditor(code);
        });
    });
    document.querySelectorAll('.btn-inv-row-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = btn.dataset.code;
            if (window.openInvoiceEditor) window.openInvoiceEditor(code);
        });
    });
});
