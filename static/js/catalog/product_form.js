// # File này chịu trách nhiệm xử lý biểu mẫu Thêm/Cập nhật Món ăn: xem trước ảnh tải lên, định dạng giá bán và kiểm tra dữ liệu hợp lệ.
(() => {
    // 1. Format số tiền khi người dùng gõ
    const parseNum = val => Number(String(val).replace(/\D/g, '') || 0);
    const formatNum = val => parseNum(val).toLocaleString('vi-VN');

    const priceInput = document.getElementById('id_price');
    const price2Input = document.getElementById('id_price_2');
    const price3Input = document.getElementById('id_price_3');
    const costInput = document.getElementById('id_cost_price');

    const liveProfit = document.getElementById('live-profit-display');
    const liveMargin = document.getElementById('live-margin-display');

    function updateKPI() {
        const p = parseNum(priceInput.value);
        const c = parseNum(costInput.value);
        const profit = p - c;
        const margin = p > 0 ? ((profit / p) * 100).toFixed(1) : 0;

        liveProfit.textContent = `${profit.toLocaleString('vi-VN')} đ`;
        liveMargin.textContent = `${margin}%`;

        if (margin >= 50) {
            liveMargin.style.color = '#16a34a';
        } else if (margin >= 30) {
            liveMargin.style.color = '#d97706';
        } else {
            liveMargin.style.color = '#dc2626';
        }
    }

    [priceInput, price2Input, price3Input].forEach(inp => {
        if (!inp) return;
        inp.value = formatNum(inp.value);
        inp.addEventListener('input', (e) => {
            const pos = e.target.selectionStart;
            e.target.value = formatNum(e.target.value);
            updateKPI();
        });
    });

    // 2. Nút chọn nhanh ĐVT
    document.querySelectorAll('.btn-quick-unit').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('id_unit').value = btn.dataset.unit;
        });
    });

    // 3. Tự sinh mã món
    document.getElementById('btn-auto-code')?.addEventListener('click', () => {
        const catSelect = document.getElementById('id_category');
        const catText = catSelect.selectedOptions[0]?.text || '';
        let prefix = 'M';
        if (catText) {
            prefix = catText.split(/\s+/).map(w => w[0]).join('').toUpperCase().substring(0, 3) || 'M';
        }
        const rand = Math.floor(Math.random() * 90) + 10;
        document.getElementById('id_code').value = `${prefix}${rand}`;
    });

    // Clean giá trị format trước khi submit form chuẩn Django
    document.getElementById('main-product-form')?.addEventListener('submit', () => {
        [priceInput, price2Input, price3Input].forEach(inp => {
            if (inp) inp.value = parseNum(inp.value);
        });
    });

    updateKPI();
})();
