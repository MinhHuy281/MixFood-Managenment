// # File này chịu trách nhiệm điều khiển toàn bộ giao diện và tương tác AJAX cho các chức năng mở rộng trên thanh Menu POS: Mở két đựng tiền, Thiết bị POS, Bảo trì dữ liệu, Khách hàng, Sổ thu chi tiền mặt, Quản lý công nợ, Phân công bàn ca, Báo cáo và Trợ giúp.
document.addEventListener('DOMContentLoaded', () => {
    const hubModal = document.getElementById('modal-pos-feature-hub');
    const hubTitle = document.getElementById('pos-hub-title');
    const hubBadge = document.getElementById('pos-hub-badge');
    const hubBody = document.getElementById('pos-hub-body');
    const hubClose = document.getElementById('pos-hub-close');
    const hubCloseBtn = document.getElementById('pos-hub-close-btn');
    const hubStatusHint = document.getElementById('pos-hub-status-hint');

    if (!hubModal || !hubBody) return;

    const apiUrl = hubModal.dataset.apiUrl || '/sales/pos-features/api/';
    const backupUrl = hubModal.dataset.backupUrl || '/sales/pos-features/backup/';

    const getCsrfToken = () => {
        const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
        const inp = document.querySelector('input[name="csrfmiddlewaretoken"]');
        return inp ? inp.value : '';
    };

    const escapeHtml = (str) => {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const fmtMoney = (val) => `${Number(val || 0).toLocaleString('vi-VN')} đ`;

    const showNotice = (msg) => {
        const noticeEl = document.getElementById('system-notice');
        if (!noticeEl) return;
        noticeEl.textContent = msg;
        noticeEl.hidden = false;
        window.clearTimeout(window.__posHubToastTimer);
        window.__posHubToastTimer = window.setTimeout(() => {
            noticeEl.hidden = true;
        }, 3200);
    };

    const closeHubModal = () => {
        hubModal.hidden = true;
    };

    hubClose?.addEventListener('click', closeHubModal);
    hubCloseBtn?.addEventListener('click', closeHubModal);
    hubModal.addEventListener('click', (e) => {
        if (e.target === hubModal) closeHubModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !hubModal.hidden) closeHubModal();
    });

    const fetchHubData = async (moduleName, extraParams = {}) => {
        const params = new URLSearchParams({ module: moduleName, ...extraParams });
        const resp = await fetch(`${apiUrl}?${params.toString()}`, {
            headers: { 'Accept': 'application/json' },
        });
        return resp.json();
    };

    const postHubAction = async (payload) => {
        const resp = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
            },
            body: JSON.stringify(payload),
        });
        return resp.json();
    };

    // =========================================================================
    // 1. MỞ KÉT ĐỰNG TIỀN (DRAWER)
    // =========================================================================
    const renderDrawerModule = async () => {
        hubBadge.textContent = 'HỆ THỐNG • KÉT ĐỰNG TIỀN';
        hubTitle.textContent = 'Quản lý & Kích hoạt Mở Két Đựng Tiền (Cash Drawer)';
        hubBody.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;">Đang tải trạng thái két đựng tiền...</div>';
        const data = await fetchHubData('drawer');
        if (!data.ok) return;
        const d = data.drawer || {};
        const history = d.history || [];

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Tiền Mặt Trong Két</div>
                    <div class="kpi-val">${escapeHtml(data.expected_cash_fmt)}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Thu Bán Hàng Tiền Mặt</div>
                    <div class="kpi-val">${escapeHtml(data.cash_sales_fmt)}</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Tổng Phiếu Thu Tiền Mặt</div>
                    <div class="kpi-val">${escapeHtml(data.cash_in_fmt)}</div>
                </div>
                <div class="pos-hub-kpi-card rose">
                    <div class="kpi-label">Tổng Phiếu Chi Tiền Mặt</div>
                    <div class="kpi-val">${escapeHtml(data.cash_out_fmt)}</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>🔓 Lệnh kích hoạt mở chốt điện tử két đựng tiền (RJ11 / Máy in POS-80C)</span>
                    <span class="pos-hub-pill green">Trạng thái: Đã kết nối cổng RJ11</span>
                </div>
                <div class="pos-hub-form-grid">
                    <div class="pos-hub-field" style="grid-column: span 2;">
                        <label>Lý do mở két đựng tiền (Ghi vào Nhật ký hoạt động)</label>
                        <input type="text" id="hub-drawer-reason" value="Đổi tiền lẻ cho khách / Kiểm quỹ" placeholder="Nhập lý do mở két...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="hub-btn-open-drawer">⚡ Mở Két Đựng Tiền Ngay</button>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Thời điểm mở</th>
                                <th>Nhân viên thao tác</th>
                                <th>Lý do mở két</th>
                                <th class="text-right">Ghi chú tồn két</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${history.map((h) => `
                                <tr>
                                    <td><strong>${escapeHtml(h.time)}</strong></td>
                                    <td><span class="pos-hub-pill blue">${escapeHtml(h.actor)}</span></td>
                                    <td>${escapeHtml(h.reason)}</td>
                                    <td class="text-right">${escapeHtml(h.amount_note || '-')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('hub-btn-open-drawer')?.addEventListener('click', async () => {
            const reason = document.getElementById('hub-drawer-reason')?.value.trim() || 'Mở két kiểm quỹ';
            const res = await postHubAction({ action: 'open_drawer', reason });
            if (res.ok) {
                showNotice(res.message);
                renderDrawerModule();
            } else {
                showNotice(res.error || 'Lỗi khi mở két.');
            }
        });
    };

    // =========================================================================
    // 2. THIẾT BỊ POS & MÁY IN (DEVICE)
    // =========================================================================
    const renderDeviceModule = async () => {
        hubBadge.textContent = 'HỆ THỐNG • THIẾT BỊ POS';
        hubTitle.textContent = 'Cấu hình Thiết bị POS, Máy in Hóa đơn & Máy in Bếp/Bar';
        hubBody.innerHTML = '<div style="padding:24px;text-align:center;color:#64748b;">Đang kiểm tra kết nối thiết bị...</div>';
        const data = await fetchHubData('device');
        const dev = data.devices || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Máy In Hóa Đơn Thu Ngân</div>
                    <div class="kpi-val">Trực tuyến (${escapeHtml(dev.paper_size || '80mm')})</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Máy In Nhiệt Bếp (LAN)</div>
                    <div class="kpi-val">${escapeHtml(dev.kitchen_printer_ip || '192.168.1.201')}</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Máy In Quầy Pha Chế</div>
                    <div class="kpi-val">${escapeHtml(dev.bar_printer_ip || '192.168.1.202')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Mã Trạm Thiết Bị POS</div>
                    <div class="kpi-val">${escapeHtml(dev.pos_code || 'POS-80C-13255')}</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>🖨️ Thiết lập thông số kết nối Máy in & Phần cứng tại quầy</span>
                </div>
                <div class="pos-hub-form-grid">
                    <div class="pos-hub-field">
                        <label>Mã Trạm POS</label>
                        <input type="text" id="dev-pos-code" value="${escapeHtml(dev.pos_code || 'POS-80C-13255')}">
                    </div>
                    <div class="pos-hub-field">
                        <label>Tên máy in Thu ngân</label>
                        <input type="text" id="dev-printer-name" value="${escapeHtml(dev.cashier_printer_name || 'EPSON TM-T82III')}">
                    </div>
                    <div class="pos-hub-field">
                        <label>Địa chỉ IP Máy in Thu ngân</label>
                        <input type="text" id="dev-printer-ip" value="${escapeHtml(dev.cashier_printer_ip || '192.168.1.200')}">
                    </div>
                    <div class="pos-hub-field">
                        <label>Khổ giấy in nhiệt</label>
                        <select id="dev-paper-size">
                            <option value="80mm" ${dev.paper_size === '80mm' ? 'selected' : ''}>Khổ K80 (80mm chuẩn)</option>
                            <option value="58mm" ${dev.paper_size === '58mm' ? 'selected' : ''}>Khổ K58 (58mm nhỏ)</option>
                        </select>
                    </div>
                    <div class="pos-hub-field">
                        <label>Số liên in hóa đơn</label>
                        <input type="number" id="dev-copies" min="1" max="5" value="${Number(dev.print_copies || 1)}">
                    </div>
                    <div class="pos-hub-field">
                        <label>IP Máy in Bếp</label>
                        <input type="text" id="dev-kitchen-ip" value="${escapeHtml(dev.kitchen_printer_ip || '192.168.1.201')}">
                    </div>
                    <div class="pos-hub-field">
                        <label>IP Máy in Quầy Bar</label>
                        <input type="text" id="dev-bar-ip" value="${escapeHtml(dev.bar_printer_ip || '192.168.1.202')}">
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button type="button" class="pos-hub-btn secondary" id="dev-btn-test-print">🖨️ In thử</button>
                        <button type="button" class="pos-hub-btn primary" id="dev-btn-save">💾 Lưu cấu hình</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('dev-btn-test-print')?.addEventListener('click', () => {
            showNotice('🖨️ Đã gửi lệnh in phiếu kiểm tra tới máy in ' + (document.getElementById('dev-printer-ip')?.value || 'POS-80C') + '!');
        });

        document.getElementById('dev-btn-save')?.addEventListener('click', async () => {
            const res = await postHubAction({
                action: 'save_device',
                pos_code: document.getElementById('dev-pos-code')?.value.trim(),
                cashier_printer_name: document.getElementById('dev-printer-name')?.value.trim(),
                cashier_printer_ip: document.getElementById('dev-printer-ip')?.value.trim(),
                paper_size: document.getElementById('dev-paper-size')?.value,
                print_copies: Number(document.getElementById('dev-copies')?.value || 1),
                kitchen_printer_ip: document.getElementById('dev-kitchen-ip')?.value.trim(),
                bar_printer_ip: document.getElementById('dev-bar-ip')?.value.trim(),
            });
            if (res.ok) {
                showNotice(res.message);
                renderDeviceModule();
            }
        });
    };

    // =========================================================================
    // 3. BẢO TRÌ DỮ LIỆU (MAINTENANCE)
    // =========================================================================
    const renderMaintenanceModule = async () => {
        hubBadge.textContent = 'HỆ THỐNG • BẢO TRÌ DỮ LIỆU';
        hubTitle.textContent = 'Bảo trì Cơ sở dữ liệu, Chuẩn hóa Tồn kho & Sao lưu Hệ thống';
        const data = await fetchHubData('maintenance');
        const st = data.stats || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Dung Lượng Cơ Sở Dữ Liệu</div>
                    <div class="kpi-val">${escapeHtml(st.db_size_display || '0 KB')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Tổng Số Hóa Đơn & Đơn Hàng</div>
                    <div class="kpi-val">${Number(st.invoices_count || 0)} HĐ / ${Number(st.orders_count || 0)} Đơn</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Thực Đơn & Mặt Hàng Kho</div>
                    <div class="kpi-val">${Number(st.products_count || 0)} Món / ${Number(st.ingredients_count || 0)} NL</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Nhật Ký Hoạt Động & Thẻ Kho</div>
                    <div class="kpi-val">${Number(st.logs_count || 0)} Log / ${Number(st.stock_tx_count || 0)} GD</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>🛠️ Công cụ Bảo trì, Đồng bộ Tồn kho & Sao lưu an toàn</span>
                    <span class="pos-hub-pill blue">Lần bảo trì gần nhất: ${escapeHtml(st.last_maintenance || 'Chưa thực hiện')}</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:10px;">
                    <button type="button" class="pos-hub-btn primary" id="maint-btn-optimize">⚡ Tối ưu hóa & Đồng bộ CSDL</button>
                    <button type="button" class="pos-hub-btn secondary" id="maint-btn-recalc">📦 Chuẩn hóa số liệu Tồn kho 3 Khu vực</button>
                    <a href="${escapeHtml(backupUrl)}" class="pos-hub-btn secondary" style="text-decoration:none;">📥 Tải file Sao lưu Hệ thống (.JSON)</a>
                </div>
            </div>
        `;

        document.getElementById('maint-btn-optimize')?.addEventListener('click', async () => {
            const res = await postHubAction({ action: 'maintenance_run', task: 'optimize' });
            if (res.ok) {
                showNotice(res.message);
                renderMaintenanceModule();
            }
        });
        document.getElementById('maint-btn-recalc')?.addEventListener('click', async () => {
            const res = await postHubAction({ action: 'maintenance_run', task: 'recalc_stock' });
            if (res.ok) {
                showNotice(res.message);
                renderMaintenanceModule();
            }
        });
    };

    // =========================================================================
    // 4. DANH SÁCH KHÁCH HÀNG & THÀNH VIÊN (CUSTOMERS)
    // =========================================================================
    const renderCustomersModule = async (q = '') => {
        hubBadge.textContent = 'QUẢN LÝ • KHÁCH HÀNG THÀNH VIÊN';
        hubTitle.textContent = 'Quản lý Danh sách Khách hàng, Hạng thẻ VIP & Tích điểm';
        const data = await fetchHubData('customers', { q });
        const customers = data.customers || [];
        const kpis = data.kpis || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Khách Hàng Thành Viên</div>
                    <div class="kpi-val">${Number(kpis.total_count || 0)} Khách</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Khách Hàng Hạng VIP</div>
                    <div class="kpi-val">${Number(kpis.vip_count || 0)} VIP</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Tổng Điểm Tích Lũy</div>
                    <div class="kpi-val">${Number(kpis.total_points || 0).toLocaleString('vi-VN')} điểm</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Tổng Chi Tiêu Tích Lũy</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_spent_fmt || '0 đ')}</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>👤 Thêm mới / Cập nhật Khách hàng Thành viên</span>
                </div>
                <div class="pos-hub-form-grid">
                    <div class="pos-hub-field">
                        <label>Họ và tên khách hàng *</label>
                        <input type="text" id="cust-name" placeholder="VD: Nguyễn Văn A">
                    </div>
                    <div class="pos-hub-field">
                        <label>Số điện thoại *</label>
                        <input type="text" id="cust-phone" placeholder="VD: 0905123456">
                    </div>
                    <div class="pos-hub-field">
                        <label>Hạng thẻ thành viên</label>
                        <select id="cust-tier">
                            <option value="Thành viên">Thành viên</option>
                            <option value="Thân thiết">Thân thiết</option>
                            <option value="VIP Vàng">VIP Vàng</option>
                            <option value="VIP Kim Cương">VIP Kim Cương</option>
                        </select>
                    </div>
                    <div class="pos-hub-field">
                        <label>Ghi chú sở thích</label>
                        <input type="text" id="cust-note" placeholder="VD: Ít cay, bàn tầng 1...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="cust-btn-save">+ Lưu Khách Hàng</button>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Mã KH</th>
                                <th>Họ tên khách hàng</th>
                                <th>Số điện thoại</th>
                                <th>Hạng thẻ</th>
                                <th class="text-right">Điểm tích lũy</th>
                                <th class="text-right">Tổng chi tiêu</th>
                                <th>Ghi chú</th>
                                <th class="text-center">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${customers.map((c) => `
                                <tr>
                                    <td><strong>${escapeHtml(c.code)}</strong></td>
                                    <td><strong>${escapeHtml(c.name)}</strong></td>
                                    <td>${escapeHtml(c.phone)}</td>
                                    <td><span class="pos-hub-pill ${String(c.tier).includes('VIP') ? 'amber' : 'blue'}">${escapeHtml(c.tier)}</span></td>
                                    <td class="text-right">${Number(c.points || 0).toLocaleString('vi-VN')}</td>
                                    <td class="text-right"><strong>${fmtMoney(c.total_spent)}</strong></td>
                                    <td>${escapeHtml(c.note || '-')}</td>
                                    <td class="text-center">
                                        <button type="button" class="pos-hub-btn danger cust-btn-del" data-id="${c.id}" style="height:26px;padding:0 8px;font-size:11.5px;">Xóa</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('cust-btn-save')?.addEventListener('click', async () => {
            const name = document.getElementById('cust-name')?.value.trim();
            const phone = document.getElementById('cust-phone')?.value.trim();
            const tier = document.getElementById('cust-tier')?.value;
            const note = document.getElementById('cust-note')?.value.trim();
            if (!name) {
                showNotice('Vui lòng nhập họ tên khách hàng.');
                return;
            }
            const res = await postHubAction({
                action: 'save_customer',
                name,
                phone,
                tier,
                points: 100,
                total_spent: 0,
                note,
            });
            if (res.ok) {
                showNotice(res.message);
                renderCustomersModule();
            } else {
                showNotice(res.error || 'Không thể lưu khách hàng.');
            }
        });

        hubBody.querySelectorAll('.cust-btn-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const res = await postHubAction({ action: 'delete_customer', id: btn.dataset.id });
                if (res.ok) {
                    showNotice(res.message);
                    renderCustomersModule();
                }
            });
        });
    };

    // =========================================================================
    // 5. SỔ THU CHI TIỀN MẶT (CASHBOOK)
    // =========================================================================
    const renderCashbookModule = async (filterType = 'all') => {
        hubBadge.textContent = 'QUẢN LÝ • SỔ THU CHI TIỀN MẶT';
        hubTitle.textContent = 'Sổ Thu Chi Tiền Mặt & Quản Lý Quỹ Tại Quầy';
        const data = await fetchHubData('cashbook');
        let vouchers = data.vouchers || [];
        const kpis = data.kpis || {};

        if (filterType === 'in') {
            vouchers = vouchers.filter((v) => v.type === 'in');
        } else if (filterType === 'out') {
            vouchers = vouchers.filter((v) => v.type === 'out');
        }

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Phiếu Thu (+)</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_in_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Thu Bán Hàng Tiền Mặt (+)</div>
                    <div class="kpi-val">${escapeHtml(kpis.cash_sales_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card rose">
                    <div class="kpi-label">Tổng Phiếu Chi (-)</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_out_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Tồn Quỹ Tiền Mặt Cuối Kỳ (=)</div>
                    <div class="kpi-val">${escapeHtml(kpis.closing_fmt || '0 đ')}</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>📝 Lập Phiếu Thu (PT) / Phiếu Chi (PC) mới vào Sổ Quỹ</span>
                    <span style="font-size:12px;font-weight:600;color:#64748b;">Hệ thống tự động đồng bộ tồn quỹ tiền mặt theo thời gian thực</span>
                </div>
                <div class="pos-hub-form-grid" style="grid-template-columns: 160px 220px 180px 200px 1fr auto;">
                    <div class="pos-hub-field">
                        <label>Loại phiếu *</label>
                        <select id="cb-type">
                            <option value="out">Phiếu Chi tiền (-)</option>
                            <option value="in">Phiếu Thu tiền (+)</option>
                        </select>
                    </div>
                    <div class="pos-hub-field">
                        <label>Hạng mục thu/chi *</label>
                        <input type="text" id="cb-category" placeholder="VD: Mua đá viên, Nộp quỹ đầu ca...">
                    </div>
                    <div class="pos-hub-field">
                        <label>Số tiền (đ) *</label>
                        <input type="number" id="cb-amount" min="1000" step="1000" placeholder="VD: 150000">
                    </div>
                    <div class="pos-hub-field">
                        <label>Người giao/nhận</label>
                        <input type="text" id="cb-person" placeholder="VD: Bếp trưởng, Thu ngân...">
                    </div>
                    <div class="pos-hub-field">
                        <label>Diễn giải chi tiết</label>
                        <input type="text" id="cb-note" placeholder="Ghi chú chứng từ, lý do chi...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="cb-btn-save" style="margin-bottom:1px;">+ Lưu Phiếu</button>
                </div>
            </div>

            <div class="pos-hub-filter-bar">
                <div class="pos-hub-filter-group">
                    <span style="font-size:12.5px;font-weight:700;color:#475569;">Lọc phiếu:</span>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'all' ? 'active' : ''}" data-cb-filter="all">Tất cả chứng từ (${(data.vouchers || []).length})</button>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'in' ? 'active' : ''}" data-cb-filter="in">Chỉ Phiếu Thu (+)</button>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'out' ? 'active' : ''}" data-cb-filter="out">Chỉ Phiếu Chi (-)</button>
                </div>
                <div class="pos-hub-filter-group">
                    <input type="text" id="cb-filter-search" placeholder="🔍 Tìm mã, hạng mục, người nhận..." style="height:34px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;width:240px;">
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap" style="max-height:calc(92vh - 360px);min-height:340px;">
                    <table class="pos-hub-table" id="cb-table">
                        <thead>
                            <tr>
                                <th style="width:100px;">Mã phiếu</th>
                                <th style="width:130px;">Loại phiếu</th>
                                <th style="width:150px;">Thời gian</th>
                                <th style="width:180px;">Hạng mục</th>
                                <th style="width:160px;">Người giao/nhận</th>
                                <th>Diễn giải chi tiết</th>
                                <th class="text-right" style="width:140px;">Số tiền</th>
                                <th class="text-center" style="width:70px;">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vouchers.length ? vouchers.map((v) => `
                                <tr>
                                    <td><strong style="color:#0369a1;">${escapeHtml(v.code)}</strong></td>
                                    <td>
                                        <span class="pos-hub-pill ${v.type === 'in' ? 'green' : 'red'}">
                                            ${v.type === 'in' ? 'Phiếu Thu (+)' : 'Phiếu Chi (-)'}
                                        </span>
                                    </td>
                                    <td>${escapeHtml(v.created_at)}</td>
                                    <td><strong>${escapeHtml(v.category)}</strong></td>
                                    <td>${escapeHtml(v.person || '-')}</td>
                                    <td style="max-width:280px;white-space:normal;">${escapeHtml(v.note || '-')}</td>
                                    <td class="text-right" style="font-weight:800;font-size:13.5px;color:${v.type === 'in' ? '#059669' : '#e11d48'};">
                                        ${v.type === 'in' ? '+' : '-'}${fmtMoney(v.amount)}
                                    </td>
                                    <td class="text-center">
                                        <button type="button" class="pos-hub-btn danger cb-btn-del" data-id="${v.id}" style="height:28px;padding:0 9px;font-size:12px;">Xóa</button>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="8" style="text-align:center;padding:36px;color:#64748b;">
                                        Không có chứng từ thu chi nào phù hợp điều kiện lọc.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Tab filters
        hubBody.querySelectorAll('.pos-hub-tab-btn[data-cb-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                renderCashbookModule(btn.dataset.cbFilter);
            });
        });

        // Search
        const searchInput = document.getElementById('cb-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const term = searchInput.value.trim().toLowerCase();
                hubBody.querySelectorAll('#cb-table tbody tr').forEach((tr) => {
                    tr.style.display = tr.textContent.toLowerCase().includes(term) ? '' : 'none';
                });
            });
        }

        document.getElementById('cb-btn-save')?.addEventListener('click', async () => {
            const type = document.getElementById('cb-type')?.value || 'out';
            const category = document.getElementById('cb-category')?.value.trim();
            const amount = Number(document.getElementById('cb-amount')?.value || 0);
            const person = document.getElementById('cb-person')?.value.trim();
            const note = document.getElementById('cb-note')?.value.trim();
            if (amount <= 0) {
                showNotice('Vui lòng nhập số tiền hợp lệ (> 0).');
                return;
            }
            const res = await postHubAction({
                action: 'save_voucher',
                type,
                category,
                amount,
                person,
                note,
            });
            if (res.ok) {
                showNotice(res.message);
                renderCashbookModule(filterType);
            } else {
                showNotice(res.error || 'Không thể lưu phiếu thu chi.');
            }
        });

        hubBody.querySelectorAll('.cb-btn-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const res = await postHubAction({ action: 'delete_voucher', id: btn.dataset.id });
                if (res.ok) {
                    showNotice(res.message);
                    renderCashbookModule(filterType);
                }
            });
        });
    };

    // =========================================================================
    // 6. QUẢN LÝ CÔNG NỢ KHÁCH HÀNG & NHÀ CUNG CẤP (DEBT)
    // =========================================================================
    const renderDebtModule = async (filterType = 'all') => {
        hubBadge.textContent = 'QUẢN LÝ • CÔNG NỢ ĐỐI TÁC';
        hubTitle.textContent = 'Quản lý Công nợ Khách hàng & Nhà cung cấp (Tự động kết chuyển Sổ quỹ)';
        const data = await fetchHubData('debt');
        let debts = data.debts || [];
        const kpis = data.kpis || {};

        if (filterType === 'customer') {
            debts = debts.filter((d) => d.debt_type === 'customer');
        } else if (filterType === 'supplier') {
            debts = debts.filter((d) => d.debt_type === 'supplier');
        }

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Phải Thu Khách Hàng</div>
                    <div class="kpi-val">${escapeHtml(kpis.receivable_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card rose">
                    <div class="kpi-label">Phải Trả Nhà Cung Cấp</div>
                    <div class="kpi-val">${escapeHtml(kpis.payable_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Cân Đối Công Nợ Ròng</div>
                    <div class="kpi-val">${escapeHtml(kpis.net_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Khoản Nợ Đang Theo Dõi</div>
                    <div class="kpi-val">${Number(kpis.active_count || 0)} khoản</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title">
                    <span>📋 Ghi nhận khoản Công nợ mới (Khách nợ quán / Quán nợ Nhà cung cấp)</span>
                    <span style="font-size:12px;font-weight:600;color:#64748b;">Khoản thu hồi hoặc chi trả nợ sẽ tự động lập phiếu vào Sổ thu chi tiền mặt</span>
                </div>
                <div class="pos-hub-form-grid" style="grid-template-columns: 220px 220px 180px 180px 1fr auto;">
                    <div class="pos-hub-field">
                        <label>Phân loại công nợ *</label>
                        <select id="debt-type">
                            <option value="customer">Khách hàng nợ quán (Phải thu)</option>
                            <option value="supplier">Quán nợ Nhà cung cấp (Phải trả)</option>
                        </select>
                    </div>
                    <div class="pos-hub-field">
                        <label>Tên Khách hàng / NCC *</label>
                        <input type="text" id="debt-partner" placeholder="VD: NPP Hải Sản Đà Nẵng">
                    </div>
                    <div class="pos-hub-field">
                        <label>Số điện thoại</label>
                        <input type="text" id="debt-phone" placeholder="VD: 0905111222">
                    </div>
                    <div class="pos-hub-field">
                        <label>Tổng tiền nợ (đ) *</label>
                        <input type="number" id="debt-total" min="1000" step="10000" placeholder="VD: 2000000">
                    </div>
                    <div class="pos-hub-field">
                        <label>Ghi chú hóa đơn / đợt hàng</label>
                        <input type="text" id="debt-note" placeholder="Nội dung, tiệc liên hoan, đợt nhập...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="debt-btn-save" style="margin-bottom:1px;">+ Ghi Nhận Nợ</button>
                </div>
            </div>

            <div class="pos-hub-filter-bar">
                <div class="pos-hub-filter-group">
                    <span style="font-size:12.5px;font-weight:700;color:#475569;">Lọc đối tác:</span>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'all' ? 'active' : ''}" data-debt-filter="all">Tất cả đối tác (${(data.debts || []).length})</button>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'customer' ? 'active' : ''}" data-debt-filter="customer">Phải thu Khách hàng</button>
                    <button type="button" class="pos-hub-tab-btn ${filterType === 'supplier' ? 'active' : ''}" data-debt-filter="supplier">Phải trả Nhà cung cấp</button>
                </div>
                <div class="pos-hub-filter-group">
                    <input type="text" id="debt-filter-search" placeholder="🔍 Tìm đối tác, SĐT, ghi chú..." style="height:34px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;width:240px;">
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap" style="max-height:calc(92vh - 360px);min-height:340px;">
                    <table class="pos-hub-table" id="debt-table">
                        <thead>
                            <tr>
                                <th style="width:100px;">Mã CN</th>
                                <th style="width:140px;">Phân loại</th>
                                <th style="width:220px;">Đối tác (Khách / NCC)</th>
                                <th class="text-right" style="width:140px;">Tổng phát sinh</th>
                                <th class="text-right" style="width:140px;">Đã thanh toán</th>
                                <th class="text-right" style="width:150px;">Còn nợ lại</th>
                                <th>Ghi chú chi tiết</th>
                                <th class="text-center" style="width:120px;">Tất toán nhanh</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${debts.length ? debts.map((d) => {
                                const rem = Number(d.remaining_amount || 0);
                                return `
                                <tr>
                                    <td><strong style="color:#0369a1;">${escapeHtml(d.code)}</strong></td>
                                    <td>
                                        <span class="pos-hub-pill ${d.debt_type === 'customer' ? 'blue' : 'amber'}">
                                            ${d.debt_type === 'customer' ? 'Phải thu KH' : 'Phải trả NCC'}
                                        </span>
                                    </td>
                                    <td>
                                        <strong>${escapeHtml(d.partner_name)}</strong>
                                        ${d.phone ? `<br><small style="color:#64748b;">📞 ${escapeHtml(d.phone)}</small>` : ''}
                                    </td>
                                    <td class="text-right">${fmtMoney(d.total_amount)}</td>
                                    <td class="text-right" style="color:#059669;font-weight:600;">${fmtMoney(d.paid_amount)}</td>
                                    <td class="text-right" style="font-weight:800;font-size:13.5px;color:${rem > 0 ? '#e11d48' : '#059669'};">
                                        ${fmtMoney(rem)}
                                    </td>
                                    <td style="max-width:280px;white-space:normal;">${escapeHtml(d.note || '-')}</td>
                                    <td class="text-center">
                                        ${rem > 0
                                            ? `<button type="button" class="pos-hub-btn primary debt-btn-pay" data-id="${d.id}" data-rem="${rem}" style="height:28px;padding:0 12px;font-size:12px;">Tất toán đủ</button>`
                                            : `<span class="pos-hub-pill green">Đã tất toán</span>`
                                        }
                                    </td>
                                </tr>
                                `;
                            }).join('') : `
                                <tr>
                                    <td colspan="8" style="text-align:center;padding:36px;color:#64748b;">
                                        Không có khoản công nợ nào phù hợp điều kiện lọc.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Filter tabs
        hubBody.querySelectorAll('.pos-hub-tab-btn[data-debt-filter]').forEach((btn) => {
            btn.addEventListener('click', () => {
                renderDebtModule(btn.dataset.debtFilter);
            });
        });

        // Search
        const searchInput = document.getElementById('debt-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const term = searchInput.value.trim().toLowerCase();
                hubBody.querySelectorAll('#debt-table tbody tr').forEach((tr) => {
                    tr.style.display = tr.textContent.toLowerCase().includes(term) ? '' : 'none';
                });
            });
        }

        document.getElementById('debt-btn-save')?.addEventListener('click', async () => {
            const debt_type = document.getElementById('debt-type')?.value || 'customer';
            const partner_name = document.getElementById('debt-partner')?.value.trim();
            const phone = document.getElementById('debt-phone')?.value.trim();
            const total_amount = Number(document.getElementById('debt-total')?.value || 0);
            const note = document.getElementById('debt-note')?.value.trim();
            if (!partner_name || total_amount <= 0) {
                showNotice('Vui lòng nhập tên đối tác và số tiền công nợ (> 0).');
                return;
            }
            const res = await postHubAction({
                action: 'save_debt',
                debt_type,
                partner_name,
                phone,
                total_amount,
                paid_amount: 0,
                note,
            });
            if (res.ok) {
                showNotice(res.message);
                renderDebtModule(filterType);
            }
        });

        hubBody.querySelectorAll('.debt-btn-pay').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const res = await postHubAction({
                    action: 'pay_debt',
                    id: btn.dataset.id,
                    pay_amount: Number(btn.dataset.rem || 0),
                });
                if (res.ok) {
                    showNotice(res.message);
                    renderDebtModule(filterType);
                }
            });
        });
    };

    // =========================================================================
    // 7. PHÂN CÔNG BÀN CA (SHIFT ASSIGN)
    // =========================================================================
    const renderShiftAssignModule = async () => {
        hubBadge.textContent = 'QUẢN LÝ • PHÂN CÔNG BÀN CA';
        hubTitle.textContent = 'Phân công Khu vực Bàn & Ca làm việc cho Nhân sự';
        const data = await fetchHubData('shift_assign');
        const staff = data.staff || [];
        const areas = data.areas || ['Ngoài trời', 'Tầng 1', 'Tầng 2', 'Mang về'];

        // Tạo danh sách mốc giờ hoạt động của quán: 09:00 -> 22:00 (mỗi 30 phút)
        const timeSlots = [];
        for (let h = 9; h <= 22; h++) {
            const hh = String(h).padStart(2, '0');
            timeSlots.push(`${hh}:00`);
            if (h < 22) timeSlots.push(`${hh}:30`);
        }

        const parseShiftTimes = (shiftStr) => {
            const m = String(shiftStr || '').match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
            if (m) {
                const start = timeSlots.includes(m[1]) ? m[1] : '09:00';
                const end = timeSlots.includes(m[2]) ? m[2] : '22:00';
                return { start, end };
            }
            if ((shiftStr || '').toLowerCase().includes('sáng')) return { start: '09:00', end: '17:00' };
            if ((shiftStr || '').toLowerCase().includes('tối') || (shiftStr || '').toLowerCase().includes('chiều')) return { start: '17:00', end: '22:00' };
            return { start: '09:00', end: '22:00' };
        };

        const formatShiftLabel = (start, end) => {
            if (start === '09:00' && end === '17:00') return 'Ca Sáng (09:00 - 17:00)';
            if (start === '17:00' && end === '22:00') return 'Ca Tối (17:00 - 22:00)';
            if (start === '09:00' && end === '22:00') return 'Toàn thời gian (09:00 - 22:00)';
            return `Ca làm (${start} - ${end})`;
        };

        const sangCount = staff.filter((s) => {
            const t = parseShiftTimes(s.shift_name);
            return t.start === '09:00' && t.end === '17:00';
        }).length;
        const toiCount = staff.filter((s) => {
            const t = parseShiftTimes(s.shift_name);
            return t.start === '17:00' && t.end === '22:00';
        }).length;
        const otherCount = staff.length - sangCount - toiCount;

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Nhân Sự Hệ Thống</div>
                    <div class="kpi-val">${staff.length} nhân sự</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Ca Sáng (09:00 - 17:00)</div>
                    <div class="kpi-val">${sangCount} nhân viên</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Ca Tối (17:00 - 22:00)</div>
                    <div class="kpi-val">${toiCount} nhân viên</div>
                </div>
                <div class="pos-hub-kpi-card rose">
                    <div class="kpi-label">Toàn Thời Gian / Khác (09:00 - 22:00)</div>
                    <div class="kpi-val">${otherCount} nhân viên</div>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap" style="max-height:calc(92vh - 280px);min-height:360px;">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th style="width:120px;">Tài khoản</th>
                                <th style="width:170px;">Họ và tên nhân viên</th>
                                <th style="width:130px;">Bộ phận / Vai trò</th>
                                <th style="min-width:210px;">Khu vực bàn phụ trách</th>
                                <th style="min-width:340px;">Mốc giờ làm việc (09:00 - 22:00)</th>
                                <th style="min-width:190px;">Trạng thái / Ghi chú ca</th>
                                <th class="text-center" style="width:95px;">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${staff.map((s) => {
                                const t = parseShiftTimes(s.shift_name);
                                return `
                                <tr data-uid="${s.user_id}">
                                    <td><strong style="color:#0369a1;">${escapeHtml(s.username)}</strong></td>
                                    <td><strong style="color:#0f172a;">${escapeHtml(s.full_name)}</strong></td>
                                    <td><span class="pos-hub-pill blue">${escapeHtml(s.department)}</span></td>
                                    <td>
                                        <select class="sa-area" style="height:38px;border-radius:7px;border:1px solid #cbd5e1;padding:0 10px;width:100%;background:#ffffff;font-size:13.5px;outline:none;">
                                            <option value="ALL" ${s.area_code === 'ALL' ? 'selected' : ''}>Toàn bộ khu vực bàn (ALL)</option>
                                            ${areas.map((a) => `<option value="${escapeHtml(a)}" ${s.area_code === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td>
                                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:nowrap;">
                                            <select class="sa-time-start" style="height:36px;border-radius:7px;border:1px solid #cbd5e1;padding:0 6px;background:#ffffff;font-size:13px;font-weight:600;outline:none;">
                                                ${timeSlots.slice(0, -1).map((slot) => `<option value="${slot}" ${t.start === slot ? 'selected' : ''}>${slot}</option>`).join('')}
                                            </select>
                                            <span style="color:#64748b;font-weight:700;">→</span>
                                            <select class="sa-time-end" style="height:36px;border-radius:7px;border:1px solid #cbd5e1;padding:0 6px;background:#ffffff;font-size:13px;font-weight:600;outline:none;">
                                                ${timeSlots.slice(1).map((slot) => `<option value="${slot}" ${t.end === slot ? 'selected' : ''}>${slot}</option>`).join('')}
                                            </select>
                                            <button type="button" class="sa-quick-shift" data-start="09:00" data-end="17:00" style="height:30px;padding:0 8px;border-radius:6px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;" title="Ca Sáng 09:00 - 17:00">Sáng</button>
                                            <button type="button" class="sa-quick-shift" data-start="17:00" data-end="22:00" style="height:30px;padding:0 8px;border-radius:6px;border:1px solid #fde68a;background:#fffbeb;color:#b45309;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;" title="Ca Tối 17:00 - 22:00">Tối</button>
                                            <button type="button" class="sa-quick-shift" data-start="09:00" data-end="22:00" style="height:30px;padding:0 8px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;" title="Toàn thời gian 09:00 - 22:00">Full</button>
                                        </div>
                                    </td>
                                    <td>
                                        <input type="text" class="sa-note" value="${escapeHtml(s.note)}" style="height:38px;border-radius:7px;border:1px solid #cbd5e1;padding:0 10px;width:100%;font-size:13.5px;outline:none;" placeholder="Ghi chú phân công...">
                                    </td>
                                    <td class="text-center">
                                        <button type="button" class="pos-hub-btn primary sa-btn-save" style="height:36px;padding:0 14px;font-size:13px;">💾 Lưu</button>
                                    </td>
                                </tr>
                            `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        hubBody.querySelectorAll('.sa-quick-shift').forEach((qBtn) => {
            qBtn.addEventListener('click', () => {
                const tr = qBtn.closest('tr');
                const startSel = tr.querySelector('.sa-time-start');
                const endSel = tr.querySelector('.sa-time-end');
                if (startSel) startSel.value = qBtn.dataset.start;
                if (endSel) endSel.value = qBtn.dataset.end;
            });
        });

        hubBody.querySelectorAll('.sa-btn-save').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const tr = btn.closest('tr');
                const startVal = tr.querySelector('.sa-time-start')?.value || '09:00';
                const endVal = tr.querySelector('.sa-time-end')?.value || '22:00';
                if (startVal >= endVal) {
                    showNotice('Giờ kết thúc phải lớn hơn giờ bắt đầu.', false);
                    return;
                }
                const shiftLabel = formatShiftLabel(startVal, endVal);
                const res = await postHubAction({
                    action: 'save_shift_assign',
                    user_id: tr.dataset.uid,
                    area_code: tr.querySelector('.sa-area')?.value,
                    shift_name: shiftLabel,
                    note: tr.querySelector('.sa-note')?.value,
                });
                if (res.ok) {
                    showNotice(res.message);
                    await renderShiftAssignModule();
                }
            });
        });
    };

    // =========================================================================
    // 7b. SỔ HÓA ĐƠN KẾT CA (SHIFT INVOICES LEDGER)
    // =========================================================================
    const renderShiftInvoicesModule = async (shiftParam = 'my', dateParam = '') => {
        hubBadge.textContent = 'QUẢN LÝ • SỔ HÓA ĐƠN KẾT CA';
        hubTitle.textContent = 'Sổ Hóa Đơn Kết Ca — Danh Sách & Tổng Hợp Hóa Đơn Theo Ca Làm Việc';
        hubBody.innerHTML = '<div style="padding:40px;text-align:center;color:#64748b;"><div class="spinner-inline"></div> Đang tải sổ hóa đơn kết ca...</div>';

        const params = { module: 'shift_invoices', shift: shiftParam };
        if (dateParam) params.date = dateParam;
        const data = await fetchHubData('shift_invoices', params);
        if (!data.ok) {
            hubBody.innerHTML = `<div style="padding:24px;color:#dc2626;text-align:center;">⚠️ Không thể tải dữ liệu sổ hóa đơn kết ca: ${escapeHtml(data.error || 'Lỗi không xác định')}</div>`;
            return;
        }

        const kpis = data.kpis || {};
        const invoices = data.invoices || [];
        const currentShift = data.shift || 'my';
        const currentDate = data.date || '';

        hubBody.innerHTML = `
            <div class="pos-hub-kpis" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Số Hóa Đơn Kết Ca</div>
                    <div class="kpi-val">${Number(kpis.total_invoices || 0)} <small style="font-size:13px;font-weight:600;color:#059669;">(${Number(kpis.paid_count || 0)} đã thu)</small></div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Tổng Doanh Thu Ca</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_revenue_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Thu Tiền Mặt Ca</div>
                    <div class="kpi-val">${escapeHtml(kpis.cash_revenue_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Thu Chuyển Khoản &amp; Thẻ</div>
                    <div class="kpi-val">${escapeHtml(kpis.bank_revenue_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card rose">
                    <div class="kpi-label">Tổng Giảm Giá &amp; Hủy</div>
                    <div class="kpi-val">${escapeHtml(kpis.discount_total_fmt || '0 đ')} <small style="font-size:12px;font-weight:600;color:#e11d48;">(${Number(kpis.cancelled_count || 0)} HĐ hủy)</small></div>
                </div>
            </div>

            <div class="pos-hub-filter-bar">
                <div class="pos-hub-filter-group">
                    <span style="font-size:12.5px;font-weight:700;color:#475569;margin-right:2px;">Chọn ca:</span>
                    <button type="button" class="pos-hub-tab-btn ${currentShift === 'my' ? 'active' : ''}" data-shift="my">
                        👤 Ca của tôi (${escapeHtml(data.current_cashier || '')})
                    </button>
                    <button type="button" class="pos-hub-tab-btn ${currentShift === 'thungan1' ? 'active' : ''}" data-shift="thungan1">
                        Ca 1: Thu Ngân 1
                    </button>
                    <button type="button" class="pos-hub-tab-btn ${currentShift === 'thungan2' ? 'active' : ''}" data-shift="thungan2">
                        Ca 2: Thu Ngân 2
                    </button>
                    <button type="button" class="pos-hub-tab-btn ${currentShift === 'all' ? 'active' : ''}" data-shift="all">
                        🌟 Cả 2 ca hôm nay
                    </button>
                </div>

                <div class="pos-hub-filter-group">
                    <label style="font-size:12px;font-weight:600;color:#475569;">Ngày:</label>
                    <input type="date" id="si-filter-date" value="${escapeHtml(currentDate)}" style="height:34px;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;">
                    <input type="text" id="si-filter-search" placeholder="🔍 Tìm mã HĐ, bàn, món..." style="height:34px;padding:0 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:12.5px;width:190px;">
                    <button type="button" class="pos-hub-btn primary" id="si-btn-print-shift" style="height:34px;padding:0 12px;font-size:12px;">🖨️ In Báo Cáo Kết Ca (K80)</button>
                    <a href="/sales/invoices/?export=excel&date_from=${escapeHtml(currentDate)}&date_to=${escapeHtml(currentDate)}${currentShift !== 'all' ? '&cashier=' + encodeURIComponent(currentShift === 'my' ? data.current_cashier : currentShift) : ''}" class="pos-hub-btn secondary" id="si-btn-export-excel" style="height:34px;padding:0 12px;font-size:12px;text-decoration:none;">📥 Xuất Excel</a>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap" style="max-height:calc(92vh - 350px);min-height:340px;">
                    <table class="pos-hub-table" id="si-invoices-table">
                        <thead>
                            <tr>
                                <th style="width:90px;">Số HĐ</th>
                                <th style="width:130px;">Thời gian</th>
                                <th style="width:120px;">Điểm bàn</th>
                                <th style="width:110px;">Khu vực</th>
                                <th style="width:140px;">Thu ngân ca</th>
                                <th class="text-right" style="width:110px;">Tiền món</th>
                                <th class="text-right" style="width:100px;">Giảm giá</th>
                                <th class="text-right" style="width:90px;">Phụ thu</th>
                                <th class="text-right" style="width:130px;">Thành tiền</th>
                                <th style="width:140px;">Kiểu thanh toán</th>
                                <th style="width:110px;">Trạng thái</th>
                                <th>Các món / Ghi chú</th>
                                <th class="text-center" style="width:130px;position:sticky;right:0;background:#f1f5f9;z-index:3;">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoices.length ? invoices.map((inv) => `
                                <tr data-inv-code="${escapeHtml(inv.invoice_code)}" style="${inv.status === 'cancelled' ? 'opacity:0.65;background:#fef2f2;' : ''}">
                                    <td><strong style="color:#0369a1;cursor:pointer;" class="si-view-code" title="Xem chi tiết hóa đơn">#${escapeHtml(inv.invoice_code)}</strong></td>
                                    <td>${escapeHtml(inv.time)} <small style="color:#64748b;">(${escapeHtml(inv.full_time)})</small></td>
                                    <td><strong>${escapeHtml(inv.table_name)}</strong></td>
                                    <td><span class="pos-hub-pill blue">${escapeHtml(inv.area_name)}</span></td>
                                    <td>${escapeHtml(inv.cashier_name)}</td>
                                    <td class="text-right">${escapeHtml(inv.subtotal_fmt)}</td>
                                    <td class="text-right" style="color:#e11d48;">${inv.discount_amount > 0 ? '-' + escapeHtml(inv.discount_fmt) : '0 đ'}</td>
                                    <td class="text-right">${inv.surcharge_amount > 0 ? '+' + escapeHtml(inv.surcharge_fmt) : '0 đ'}</td>
                                    <td class="text-right" style="font-weight:800;color:${inv.status === 'cancelled' ? '#64748b' : '#059669'};font-size:13.5px;">
                                        ${escapeHtml(inv.total_amount_fmt)}
                                    </td>
                                    <td><span class="pos-hub-pill ${inv.payment_method.includes('Tiền mặt') ? 'green' : 'amber'}">${escapeHtml(inv.payment_method)}</span></td>
                                    <td>
                                        <span class="pos-hub-pill ${inv.status === 'paid' ? 'green' : 'red'}">
                                            ${escapeHtml(inv.status_display)}
                                        </span>
                                    </td>
                                    <td style="min-width:180px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(inv.items_text)}">
                                        ${escapeHtml(inv.items_text)}
                                    </td>
                                    <td class="text-center" style="position:sticky;right:0;background:#ffffff;z-index:2;box-shadow:-2px 0 5px rgba(0,0,0,0.04);">
                                        <div style="display:inline-flex;gap:5px;">
                                            <button type="button" class="pos-hub-btn primary si-btn-reprint" data-code="${escapeHtml(inv.invoice_code)}" style="height:28px;padding:0 9px;font-size:11.5px;" title="In lại bill K80">🖨️ In bill</button>
                                            <button type="button" class="pos-hub-btn secondary si-btn-edit" data-code="${escapeHtml(inv.invoice_code)}" style="height:28px;padding:0 9px;font-size:11.5px;" title="Sửa hoặc hoàn món">✏️ Sửa</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="13" style="text-align:center;padding:40px;color:#64748b;">
                                        <div style="font-size:32px;margin-bottom:8px;">🧾</div>
                                        <div>Không có hóa đơn nào phát sinh trong ca làm việc này.</div>
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Sự kiện chuyển đổi Ca làm việc
        hubBody.querySelectorAll('.pos-hub-tab-btn[data-shift]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const s = btn.dataset.shift;
                const d = document.getElementById('si-filter-date')?.value || '';
                renderShiftInvoicesModule(s, d);
            });
        });

        // Sự kiện đổi ngày
        document.getElementById('si-filter-date')?.addEventListener('change', (e) => {
            renderShiftInvoicesModule(currentShift, e.target.value);
        });

        // Sự kiện tìm kiếm nhanh
        const searchInput = document.getElementById('si-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const term = searchInput.value.trim().toLowerCase();
                const trs = hubBody.querySelectorAll('#si-invoices-table tbody tr[data-inv-code]');
                trs.forEach((tr) => {
                    const text = tr.textContent.toLowerCase();
                    tr.style.display = text.includes(term) ? '' : 'none';
                });
            });
        }

        // Sự kiện In lại bill
        hubBody.querySelectorAll('.si-btn-reprint').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.dataset.code;
                if (typeof window.reprintPosInvoiceByCode === 'function') {
                    window.reprintPosInvoiceByCode(code);
                } else {
                    window.open(`/sales/invoices/print/${encodeURIComponent(code)}/`, '_blank', 'noopener');
                }
            });
        });

        // Sự kiện Xem / Sửa hóa đơn
        hubBody.querySelectorAll('.si-btn-edit, .si-view-code').forEach((el) => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = el.dataset.code || el.closest('tr')?.dataset.invCode;
                if (window.openInvoiceEditor) {
                    window.openInvoiceEditor(code);
                } else if (typeof window.reprintPosInvoiceByCode === 'function') {
                    window.reprintPosInvoiceByCode(code);
                }
            });
        });

        // Sự kiện In Báo cáo kết ca (K80)
        document.getElementById('si-btn-print-shift')?.addEventListener('click', async () => {
            try {
                const resp = await fetch(`/sales/end-of-day/api/`);
                const eodData = await resp.json();
                if (eodData && eodData.ok) {
                    if (typeof window.printPosShiftCloseReport === 'function') {
                        const targetShiftKey = currentShift === 'all' ? 'all' : (currentShift === 'thungan1' ? 'thungan1' : (currentShift === 'thungan2' ? 'thungan2' : 'all'));
                        const shiftData = (eodData.shifts_by_key && eodData.shifts_by_key[targetShiftKey]) || eodData;
                        window.printPosShiftCloseReport(shiftData, { doneText: 'Đóng báo cáo' });
                    } else {
                        window.open(`/sales/end-of-day/print/?mode=summary&shift=${encodeURIComponent(currentShift)}`, '_blank', 'noopener');
                    }
                } else {
                    window.open(`/sales/end-of-day/print/?mode=summary&shift=${encodeURIComponent(currentShift)}`, '_blank', 'noopener');
                }
            } catch (err) {
                window.open(`/sales/end-of-day/print/?mode=summary&shift=${encodeURIComponent(currentShift)}`, '_blank', 'noopener');
            }
        });
    };

    // =========================================================================
    // 8. BÁO CÁO: DOANH THU THEO KHÁCH / MUA HÀNG / CÁC KHOẢN TIỀN
    // =========================================================================
    const renderCustomerRevenueReport = async () => {
        hubBadge.textContent = 'BÁO CÁO • DOANH THU THEO KHÁCH';
        hubTitle.textContent = 'Báo cáo Phân tích Doanh thu theo Khách hàng & Hạng thẻ';
        const data = await fetchHubData('customer_revenue');
        const rows = data.rows || [];
        const kpis = data.kpis || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Doanh Thu Khách Thành Viên</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_vip_spent_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Doanh Thu POS Đã Thanh Toán</div>
                    <div class="kpi-val">${escapeHtml(kpis.pos_paid_revenue_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Số Khách Hàng Có Giao Dịch</div>
                    <div class="kpi-val">${Number(kpis.customers_count || 0)} khách</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Tổng Lượt Khách Phục Vụ</div>
                    <div class="kpi-val">${Number(kpis.total_guests || 0)} lượt</div>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Hạng</th>
                                <th>Mã KH</th>
                                <th>Họ tên khách hàng</th>
                                <th>Số điện thoại</th>
                                <th>Hạng thẻ</th>
                                <th class="text-center">Số lần đến</th>
                                <th class="text-right">TB / Hóa đơn</th>
                                <th class="text-right">Tổng doanh thu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((r, i) => `
                                <tr>
                                    <td><strong>#${i + 1}</strong></td>
                                    <td>${escapeHtml(r.code)}</td>
                                    <td><strong>${escapeHtml(r.name)}</strong></td>
                                    <td>${escapeHtml(r.phone)}</td>
                                    <td><span class="pos-hub-pill amber">${escapeHtml(r.tier)}</span></td>
                                    <td class="text-center">${r.visits}</td>
                                    <td class="text-right">${escapeHtml(r.avg_bill_fmt)}</td>
                                    <td class="text-right" style="font-weight:800;color:#059669;">${escapeHtml(r.total_spent_fmt)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    const renderPurchasesReport = async () => {
        hubBadge.textContent = 'BÁO CÁO • HOẠT ĐỘNG MUA HÀNG';
        hubTitle.textContent = 'Báo cáo Hoạt động Mua hàng & Nhập kho Nguyên liệu';
        const data = await fetchHubData('purchases');
        const rows = data.rows || [];
        const kpis = data.kpis || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Giá Trị Mua Hàng / Nhập Kho</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_value_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Tổng Số Phiếu / Đợt Nhập</div>
                    <div class="kpi-val">${Number(kpis.receipts_count || 0)} đợt</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Tổng Danh Mục Mặt Hàng Kho</div>
                    <div class="kpi-val">${Number(kpis.ingredients_count || 0)} mặt hàng</div>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Mã chứng từ</th>
                                <th>Thời gian nhập</th>
                                <th>Nhà cung cấp</th>
                                <th>Người phụ trách</th>
                                <th>Chi tiết mặt hàng nhập</th>
                                <th class="text-right">Tổng tiền nhập</th>
                                <th>Trạng thái</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length ? rows.map((r) => `
                                <tr>
                                    <td><strong>${escapeHtml(r.receipt_code)}</strong></td>
                                    <td>${escapeHtml(r.created_at)}</td>
                                    <td><strong>${escapeHtml(r.supplier)}</strong></td>
                                    <td>${escapeHtml(r.created_by)}</td>
                                    <td>${escapeHtml(r.items_text)}</td>
                                    <td class="text-right" style="font-weight:700;color:#059669;">${escapeHtml(r.total_amount_fmt)}</td>
                                    <td><span class="pos-hub-pill green">${escapeHtml(r.status_display)}</span></td>
                                </tr>
                            `).join('') : '<tr><td colspan="7" style="text-align:center;padding:20px;color:#64748b;">Chưa có phát sinh phiếu mua hàng trong kỳ.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    const renderCashStatsReport = async () => {
        hubBadge.textContent = 'BÁO CÁO • THỐNG KÊ CÁC KHOẢN TIỀN';
        hubTitle.textContent = 'Thống kê Tổng hợp Các Khoản Tiền (Doanh thu, Phụ thu, Giảm giá & Sổ quỹ)';
        const data = await fetchHubData('cash_stats');
        const breakdown = data.breakdown || [];
        const kpis = data.kpis || {};

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Tổng Doanh Thu Đã Thanh Toán</div>
                    <div class="kpi-val">${escapeHtml(kpis.total_revenue_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Doanh Thu Tiền Mặt</div>
                    <div class="kpi-val">${escapeHtml(kpis.cash_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Chuyển Khoản QR & Thẻ</div>
                    <div class="kpi-val">${escapeHtml(kpis.bank_fmt || '0 đ')}</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Thực Tồn Tiền Mặt Tại Quầy</div>
                    <div class="kpi-val">${escapeHtml(kpis.net_cashbox_fmt || '0 đ')}</div>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Khoản mục thống kê</th>
                                <th>Phân nhóm dòng tiền</th>
                                <th>Diễn giải chi tiết</th>
                                <th class="text-right">Tổng số tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${breakdown.map((b) => `
                                <tr>
                                    <td><strong>${escapeHtml(b.label)}</strong></td>
                                    <td><span class="pos-hub-pill blue">${escapeHtml(b.type)}</span></td>
                                    <td>${escapeHtml(b.note)}</td>
                                    <td class="text-right" style="font-weight:800;color:#0f172a;">${escapeHtml(b.amount_fmt)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    const renderHelpModule = (mode = 'guide') => {
        hubBadge.textContent = 'TRỢ GIÚP • MIXFOOD CLOUD POS 2026';
        hubTitle.textContent = mode === 'version'
            ? 'Thông tin Phiên bản Hệ thống MixFood Cloud POS 2026'
            : 'Cẩm nang Hướng dẫn Sử dụng Nhanh MixFood Cloud POS 2026';

        hubBody.innerHTML = `
            <div class="pos-hub-kpis">
                <div class="pos-hub-kpi-card emerald">
                    <div class="kpi-label">Phiên Bản Phần Mềm</div>
                    <div class="kpi-val">v2026.4.0 Enterprise</div>
                </div>
                <div class="pos-hub-kpi-card blue">
                    <div class="kpi-label">Cơ Chế Phiên Đăng Nhập</div>
                    <div class="kpi-val">Dual-Session Isolation</div>
                </div>
                <div class="pos-hub-kpi-card amber">
                    <div class="kpi-label">Đồng Bộ Kho 3 Khu Vực</div>
                    <div class="kpi-val">Tự động trừ & hoàn kho</div>
                </div>
                <div class="pos-hub-kpi-card">
                    <div class="kpi-label">Hotline Kỹ Thuật 24/7</div>
                    <div class="kpi-val">0905 123 456</div>
                </div>
            </div>

            <div class="pos-hub-form-card">
                <div class="pos-hub-form-title"><span>📌 Quy trình vận hành chuẩn & Phím tắt Thu ngân / Quản lý kho</span></div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;font-size:13px;line-height:1.6;color:#334155;">
                    <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
                        <strong>1. Gọi món & Báo bếp:</strong><br>
                        • Chọn bàn ở cột Sơ đồ bàn -> Bấm dấu <b>+</b> trên món ăn -> Bấm <b>Nhập</b> để gửi chế biến.<br>
                        • Khi gọi thêm món mới sau khi đã báo bếp, hệ thống chỉ gửi phần chênh lệch <b>(+chờ bếp)</b>.
                    </div>
                    <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
                        <strong>2. Thanh toán & Sửa hóa đơn:</strong><br>
                        • Bấm <b>Thanh toán</b> để xuất hóa đơn và tự động trừ định lượng nguyên liệu.<br>
                        • Click chuột phải vào dòng hóa đơn để <b>Sửa hóa đơn</b> (tự động hoàn/trừ lại kho chính xác).
                    </div>
                    <div style="background:#f8fafc;padding:12px;border-radius:8px;border:1px solid #e2e8f0;">
                        <strong>3. Phân quyền Thu ngân & Quản lý kho:</strong><br>
                        • Tài khoản <b>thungan1</b> khi vào <i>Mặt hàng, Định lượng, Quản lý kho, Xuất nhập tồn</i> sẽ yêu cầu xác thực quyền Admin / Quản lý kho.<br>
                        • Tài khoản chuyên trách kho: <b>quanlykho</b> (Mật khẩu: <b>123456</b>).
                    </div>
                </div>
            </div>
        `;
    };

    // =========================================================================
    // HÀM ĐIỀU PHỐI MỞ MODAL THEO TÊN MODULE
    // =========================================================================
    window.openPosFeatureHub = (featureKey) => {
        if (featureKey === 'drawer') {
            postHubAction({ action: 'open_drawer', reason: 'Mở két thối tiền' })
                .then((res) => {
                    if (res && res.ok) {
                        showNotice('💵 Đã mở két đựng tiền để thối tiền!');
                    } else {
                        showNotice((res && res.error) || '💵 Đã gửi lệnh mở két thối tiền!');
                    }
                })
                .catch(() => {
                    showNotice('💵 Đã gửi lệnh mở két thối tiền!');
                });
            return;
        }

        const runOpen = () => {
            hubModal.hidden = false;
            switch (featureKey) {
                case 'device':
                    renderDeviceModule();
                    break;
                case 'maintenance':
                    renderMaintenanceModule();
                    break;
                case 'customers':
                    renderCustomersModule();
                    break;
                case 'cashbook':
                    renderCashbookModule();
                    break;
                case 'debt':
                    renderDebtModule();
                    break;
                case 'shift_assign':
                    renderShiftAssignModule();
                    break;
                case 'shift_invoices':
                    renderShiftInvoicesModule();
                    break;
                case 'customer_revenue':
                    renderCustomerRevenueReport();
                    break;
                case 'purchases':
                    renderPurchasesReport();
                    break;
                case 'cash_stats':
                    renderCashStatsReport();
                    break;
                case 'help_version':
                    renderHelpModule('version');
                    break;
                default:
                    renderHelpModule('guide');
                    break;
            }
        };

        // Kiểm tra phân quyền với các chức năng yêu cầu quyền Quản lý / Kho
        if (featureKey === 'purchases' && typeof window.requirePosPermission === 'function') {
            window.requirePosPermission('manage_inventory', runOpen, 'Báo cáo Hoạt động mua hàng');
            return;
        }
        runOpen();
    };

    // Bắt sự kiện cho "Phân công bàn ca", "Sổ hóa đơn kết ca" và menu "TRỢ GIÚP"
    document.querySelectorAll('.management-menu a, .management-menu button').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const mgmt = link.dataset.management || '';
        if (href.includes('dining') || mgmt === 'shift_assign') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                link.closest('.pos-menu-item')?.classList.remove('open');
                window.openPosFeatureHub('shift_assign');
            });
        } else if (href.includes('invoices') || mgmt === 'shift_invoices') {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                link.closest('.pos-menu-item')?.classList.remove('open');
                window.openPosFeatureHub('shift_invoices');
            });
        }
    });

    document.querySelectorAll('.help-menu a').forEach((link, idx) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            link.closest('.pos-menu-item')?.classList.remove('open');
            window.openPosFeatureHub(idx === 1 ? 'help_version' : 'help_guide');
        });
    });

    // Bắt sự kiện cho thanh tab lọc nhanh bảng Hóa đơn bên phải (.record-tab)
    const recordTabs = document.querySelectorAll('.record-tabs .record-tab');
    recordTabs.forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            recordTabs.forEach((b) => b.classList.remove('active'));
            tabBtn.classList.add('active');
            const label = tabBtn.textContent.trim();
            const rows = Array.from(document.querySelectorAll('.invoice-table tbody tr[data-invoice-code]'));
            if (!rows.length) {
                showNotice(`Tab "${label}": Hiện chưa có hóa đơn nào trong phiên.`);
                return;
            }
            if (label.includes('Đếm bàn')) {
                const uniqueTables = new Set(rows.map((r) => r.children[1]?.textContent.trim())).size;
                showNotice(`📊 Đếm bàn: Đã phục vụ ${uniqueTables} bàn (${rows.length} hóa đơn).`);
            } else if (label.includes('Tiền món') || label.includes('Phụ thu') || label.includes('Giảm giá') || label.includes('VAT')) {
                const colIdx = label.includes('Tiền món') ? 4 : (label.includes('Phụ thu') ? 6 : (label.includes('Giảm giá') ? 7 : 8));
                let sum = 0;
                rows.forEach((r) => {
                    const raw = (r.children[colIdx]?.textContent || '').replace(/[^\d]/g, '');
                    sum += Number(raw || 0);
                });
                showNotice(`💰 Tổng ${label} (${rows.length} HĐ): ${sum.toLocaleString('vi-VN')} đ`);
            }
        });
    });

    // =========================================================================
    // 10. BỘ ĐIỀU KHIỂN IN BILL NHIỆT K80 (THANH TOÁN, IN LẠI HÓA ĐƠN, KẾT CA, BÁO CÁO CUỐI NGÀY)
    // =========================================================================
    const thermalModal = document.getElementById('pos-thermal-receipt-modal');
    const thermalDialog = document.getElementById('pos-thermal-modal-dialog');
    const thermalBadge = document.getElementById('pos-thermal-modal-badge');
    const thermalTitle = document.getElementById('pos-thermal-modal-title');
    const thermalHost = document.getElementById('pos-thermal-receipt-paper-host');
    const thermalBtnPrint = document.getElementById('pos-thermal-btn-print');
    const thermalBtnOpenTab = document.getElementById('pos-thermal-btn-open-tab');
    const thermalBtnDone = document.getElementById('pos-thermal-btn-done');
    const thermalBtnClose = document.getElementById('pos-thermal-modal-close');

    let currentThermalOnClose = null;

    // Đưa modal in nhiệt trực tiếp ra thẻ <body> để khi in (@media print) không bị ẩn bởi <main class="page-shell">
    const ensureThermalModalOnBody = () => {
        if (thermalModal && thermalModal.parentElement !== document.body) {
            document.body.appendChild(thermalModal);
        }
    };
    ensureThermalModalOnBody();

    const formatDotNum = (val) => {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const closeThermalModal = () => {
        if (!thermalModal) return;
        thermalModal.hidden = true;
        document.body.classList.remove('pos-printing-thermal');
        const cb = currentThermalOnClose;
        currentThermalOnClose = null;
        if (typeof cb === 'function') {
            cb();
        }
    };

    // Chờ ảnh QR (nếu có) tải xong trước khi gọi hộp thoại window.print() của trình duyệt
    const triggerBrowserThermalPrint = () => {
        ensureThermalModalOnBody();
        if (thermalModal) {
            thermalModal.hidden = false;
        }
        document.body.classList.add('pos-printing-thermal');

        const imgs = thermalHost ? Array.from(thermalHost.querySelectorAll('img')) : [];
        const pendingImgs = imgs.filter((img) => !img.complete);

        if (pendingImgs.length === 0) {
            window.requestAnimationFrame(() => {
                window.setTimeout(() => {
                    window.print();
                }, 150);
            });
            return;
        }

        let settled = false;
        const doPrintOnce = () => {
            if (settled) return;
            settled = true;
            window.requestAnimationFrame(() => {
                window.setTimeout(() => {
                    window.print();
                }, 120);
            });
        };

        let remaining = pendingImgs.length;
        const onImgDone = () => {
            remaining -= 1;
            if (remaining <= 0) {
                doPrintOnce();
            }
        };

        pendingImgs.forEach((img) => {
            img.addEventListener('load', onImgDone, { once: true });
            img.addEventListener('error', onImgDone, { once: true });
        });

        // Fallback tối đa 600ms nếu ảnh tải chậm
        window.setTimeout(doPrintOnce, 600);
    };

    thermalBtnPrint?.addEventListener('click', triggerBrowserThermalPrint);
    thermalBtnDone?.addEventListener('click', closeThermalModal);
    thermalBtnClose?.addEventListener('click', closeThermalModal);
    thermalModal?.addEventListener('click', (e) => {
        if (e.target === thermalModal) closeThermalModal();
    });

    const buildCustomerInvoiceSlipHtml = (bill) => {
        const qr = bill.qr_info || {
            merchant_title: 'HKD MIX FOOD',
            merchant_code: 'MS00T01136681533909',
            bank_name: 'TECHCOMBANK',
            account_holder: 'HO KINH DOANH MIX FOOD AM THUC THAI',
            account_number: '1903 6559 2140 22',
            qr_image_url: '/static/images/mixfood_qr_only.jpg',
        };
        const items = Array.isArray(bill.items) ? bill.items : [];
        const itemsRowsHtml = items.map((it) => {
            const unitLabel = it.unit || 'Phần';
            const displayName = it.display_name || `${String(it.product_name || '').toUpperCase()} (${unitLabel})`;
            const uPriceFmt = it.unit_price_formatted || formatDotNum(it.unit_price);
            const totFmt = it.total_amount_formatted || formatDotNum(it.total_amount);
            return `
                <tr>
                    <td>${escapeHtml(displayName)}</td>
                    <td class="c-sl">${Number(it.quantity || 1)}</td>
                    <td class="c-price">${escapeHtml(uPriceFmt)}</td>
                    <td class="c-total">${escapeHtml(totFmt)}</td>
                </tr>
            `;
        }).join('');

        const discAmt = Number(bill.discount_amount || 0);
        const surAmt = Number(bill.surcharge_amount || 0);
        const taxAmt = Number(bill.tax_amount || 0);
        const receiptNo = bill.receipt_no || `132550${String(bill.invoice_code || '0001').padStart(4, '0')}`;
        const tableDisplay = bill.table_display || (bill.table_name && bill.table_name !== 'Mang về' ? `Bàn ${bill.table_name} (${bill.area_name || 'Ngoài trời'})` : 'Mang về');

        return `
            <div class="pos-k80-slip">
                <div class="cup-icon-wrap" aria-hidden="true">
                    <svg width="44" height="34" viewBox="0 0 64 50" fill="#111111">
                        <path d="M12 8h32v18c0 7.7-6.3 14-14 14h-4c-7.7 0-14-6.3-14-14V8z"/>
                        <path d="M44 11h5c4.4 0 8 3.6 8 8s-3.6 8-8 8h-5v-4h5c2.2 0 4-1.8 4-4s-1.8-4-4-4h-5v-4z"/>
                        <path d="M6 42h44l-3 5H9l-3-5z"/>
                    </svg>
                </div>
                <div class="brand-main">${escapeHtml(bill.store_name || 'MIX FOOD')}</div>
                <div class="brand-sub">${escapeHtml(bill.store_subtitle || 'ẨM THỰC THÁI')}</div>
                <div class="brand-addr">${escapeHtml(bill.store_address || 'K38/37 Nguyễn Duy Hiệu - Q.Sơn Trà - TP. Đà Nẵng')}</div>

                <div class="bill-table-title">${escapeHtml(tableDisplay)}</div>
                <div class="bill-meta-row">
                    <span>Thời gian: ${escapeHtml(bill.time_range_display || bill.paid_at_display || '')}</span>
                </div>
                <div class="bill-meta-row">
                    <span>Nhân viên: ${escapeHtml(bill.cashier_name || 'Thu Ngân 1')}</span>
                    <span>No.${escapeHtml(receiptNo)}</span>
                </div>

                <table class="bill-items-tbl">
                    <thead>
                        <tr>
                            <th>TÊN MÓN</th>
                            <th class="c-sl">SL</th>
                            <th class="c-price">Đ.GIÁ</th>
                            <th class="c-total">T.TIỀN</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRowsHtml}
                    </tbody>
                </table>

                <div class="line-solid"></div>

                <div class="sum-bold-row">
                    <span>TỔNG CỘNG:</span>
                    <span>${escapeHtml(bill.subtotal_formatted || formatDotNum(bill.subtotal))}</span>
                </div>

                ${discAmt > 0 ? `
                    <div class="sum-italic-row">
                        <span>Giảm giá:</span>
                        <span>${bill.discount_percent_label ? escapeHtml(bill.discount_percent_label) + '&nbsp;&nbsp;&nbsp;' : ''}${escapeHtml(bill.discount_formatted || formatDotNum(discAmt))}</span>
                    </div>
                ` : ''}

                ${surAmt > 0 ? `
                    <div class="sum-italic-row">
                        <span>Phụ thu:</span>
                        <span>${escapeHtml(bill.surcharge_formatted || formatDotNum(surAmt))}</span>
                    </div>
                ` : ''}

                ${taxAmt > 0 ? `
                    <div class="sum-italic-row">
                        <span>VAT:</span>
                        <span>${escapeHtml(bill.tax_formatted || formatDotNum(taxAmt))}</span>
                    </div>
                ` : ''}

                <div class="sum-grand-row">
                    <span>THÀNH TIỀN (đ):</span>
                    <span>${escapeHtml(bill.total_amount_formatted || formatDotNum(bill.total_amount))}</span>
                </div>

                <div class="line-double"></div>

                <div class="qr-box">
                    <div class="qr-m-title">${escapeHtml(qr.merchant_title)}</div>
                    <div class="qr-m-code">${escapeHtml(qr.merchant_code)}</div>
                    <div class="qr-bank-name">${escapeHtml(qr.bank_name)}</div>
                    <img src="${escapeHtml(qr.qr_image_url || '/static/images/mixfood_qr_only.jpg')}" alt="QR Thanh Toán MIX FOOD">
                    <div class="qr-napas">VietQR &bull; napas 247</div>
                    <div class="qr-holder">${escapeHtml(qr.account_holder)}</div>
                    <div class="qr-acc">${escapeHtml(qr.account_number)}</div>
                </div>

                <div class="bill-footer">
                    <div class="ft-1">HÂN HẠNH ĐƯỢC PHỤC VỤ QUÝ KHÁCH!</div>
                    <div class="ft-2">Giải pháp được cung cấp bởi quanso.vn</div>
                </div>
            </div>
        `;
    };

    const buildShiftReportSlipHtml = (report, customHeading = 'BÁO CÁO KẾT CA', subtitle = '') => {
        const pmap = report.payments_by_key || {};
        const cashRow = pmap.cash || { label: 'Hóa đơn tiền mặt:', count: 0, amount_formatted: '0' };
        const cardRow = pmap.card || { label: 'Hóa đơn thẻ ngân hàng:', count: 0, amount_formatted: '0' };
        const ewRow = pmap.e_wallet || { label: 'Hóa đơn ví điện tử:', count: 0, amount_formatted: '0' };
        const thermalRows = Array.isArray(report.thermal_payment_rows) && report.thermal_payment_rows.length
            ? report.thermal_payment_rows
            : [cashRow, cardRow, ewRow];

        const payHtml = thermalRows.map((r) => `
            <tr>
                <td>${escapeHtml(r.label)}</td>
                <td class="c-cnt">${Number(r.count || 0)}</td>
                <td class="c-amt">${escapeHtml(r.amount_formatted || '0')}</td>
            </tr>
        `).join('');

        return `
            <div class="pos-k80-slip">
                <div class="shift-report-heading">${escapeHtml(customHeading)}</div>
                ${subtitle ? `<div class="shift-report-sub">${escapeHtml(subtitle)}</div>` : ''}

                <div class="shift-top-grid">
                    <span>Ca trước giao lúc:</span>
                    <span>${escapeHtml(report.prev_shift_display || '--')}</span>

                    <span>Thời điểm kết ca:</span>
                    <span>${escapeHtml(report.close_shift_display || report.as_of_display || '--')}</span>

                    <span>Số hóa đơn:</span>
                    <span>${Number(report.total_invoices || 0)}</span>

                    <span>Số tiền bán:</span>
                    <span>${escapeHtml(report.total_revenue_formatted || formatDotNum(report.total_revenue))} đ</span>
                </div>

                <table class="shift-pay-tbl">
                    <tbody>
                        ${payHtml}
                    </tbody>
                </table>

                <div class="shift-note-lines">
                    <div>Có ${Number(report.discount_invoice_count || 0)} hóa đơn giảm giá (${Number(report.coupon_count || 0)} mã giảm, ${Number(report.vip_count || 0)} thẻ vip, ${Number(report.gift_count || 0)} tặng món)</div>
                    <div>Giảm ${escapeHtml(report.discount_total_formatted || '0')} đ</div>
                </div>

                <div class="shift-note-lines">
                    <div>Có ${Number(report.edit_price_discount_count || 0)} lần sửa đơn giá/giảm giá món</div>
                    <div>Có ${Number(report.cancel_return_item_count || 0)} lần trả/hủy món, ${Number(report.edit_delete_invoice_count || 0)} lần sửa/xóa hóa đơn</div>
                </div>

                <div class="shift-unpaid-grid">
                    <span>Hóa đơn chưa thu:</span>
                    <span class="c-cnt">${Number(report.unpaid_count || 0)}</span>
                    <span>${escapeHtml(report.unpaid_amount_formatted || formatDotNum(report.unpaid_amount))}</span>
                </div>
            </div>
        `;
    };

    // 10.1. In bill thanh toán khách hàng (kèm mã QR cửa hàng)
    window.printPosThermalBill = (billData, options = {}) => {
        if (!thermalModal || !thermalHost || !billData) {
            if (typeof options.onClose === 'function') options.onClose();
            return;
        }
        currentThermalOnClose = options.onClose || null;
        thermalDialog?.classList.add('single-slip');
        if (thermalBadge) thermalBadge.textContent = options.isReprint ? 'IN LẠI HÓA ĐƠN • K80' : 'THANH TOÁN & IN BILL • K80';
        if (thermalTitle) {
            thermalTitle.textContent = `${options.isReprint ? 'In lại hóa đơn' : 'Hóa đơn thanh toán'} #${billData.invoice_code || ''} — ${billData.table_display || ''}`;
        }
        if (thermalBtnDone) {
            thermalBtnDone.textContent = options.doneText || 'Hoàn tất / Đóng';
        }
        if (thermalBtnOpenTab) {
            const pUrl = billData.print_url || `/sales/invoices/print/${billData.invoice_code}/`;
            thermalBtnOpenTab.href = pUrl;
            thermalBtnOpenTab.hidden = false;
        }
        ensureThermalModalOnBody();
        thermalHost.innerHTML = buildCustomerInvoiceSlipHtml(billData);
        thermalModal.hidden = false;
        document.body.classList.add('pos-printing-thermal');

        if (options.autoPrint !== false) {
            triggerBrowserThermalPrint();
        }
    };

    // 10.2. Tải chi tiết hóa đơn theo mã và in lại bill K80 kèm QR
    window.reprintPosInvoiceByCode = async (invoiceCode) => {
        const cleanCode = String(invoiceCode || '').replace(/^#/, '').trim();
        if (!cleanCode) return;
        try {
            const resp = await fetch(`/sales/invoices/detail/${encodeURIComponent(cleanCode)}/`, {
                headers: { 'Accept': 'application/json' },
            });
            const data = await resp.json();
            if (!resp.ok || !data.ok || !data.invoice) {
                showNotice(data.error || `Không thể tải hóa đơn #${cleanCode} để in lại.`);
                return;
            }
            window.printPosThermalBill(data.invoice, {
                isReprint: true,
                autoPrint: true,
                doneText: 'Đóng cửa sổ',
            });
        } catch (err) {
            showNotice('Lỗi kết nối khi tải hóa đơn in lại.');
        }
    };

    // 10.3. In bill BÁO CÁO KẾT CA (khổ K80 chuẩn ảnh chụp thực tế)
    window.printPosShiftCloseReport = (shiftReport, options = {}) => {
        if (!thermalModal || !thermalHost || !shiftReport) {
            if (typeof options.onClose === 'function') options.onClose();
            return;
        }
        currentThermalOnClose = options.onClose || null;
        thermalDialog?.classList.add('single-slip');
        if (thermalBadge) thermalBadge.textContent = 'KẾT CA LÀM VIỆC • K80';
        if (thermalTitle) {
            thermalTitle.textContent = `Báo cáo kết ca — ${shiftReport.cashier_display || ''}`;
        }
        if (thermalBtnDone) {
            thermalBtnDone.textContent = options.doneText || 'Hoàn tất & Đăng xuất ca';
        }
        if (thermalBtnOpenTab) {
            if (shiftReport.print_url) {
                thermalBtnOpenTab.href = shiftReport.print_url;
                thermalBtnOpenTab.hidden = false;
            } else {
                thermalBtnOpenTab.hidden = true;
            }
        }
        ensureThermalModalOnBody();
        thermalHost.innerHTML = buildShiftReportSlipHtml(
            shiftReport,
            'BÁO CÁO KẾT CA',
            `Nhân viên: ${shiftReport.cashier_display || ''}`
        );
        thermalModal.hidden = false;
        document.body.classList.add('pos-printing-thermal');

        if (options.autoPrint !== false) {
            triggerBrowserThermalPrint();
        }
    };

    // 10.4. In bill BÁO CÁO CUỐI NGÀY dành cho cả 2 ca (thungan1 & thungan2)
    window.printPosEndOfDayReport = (eodData, shiftFilter = 'all', unpaidStats = null) => {
        if (!thermalModal || !thermalHost || !eodData) return;
        currentThermalOnClose = null;

        const unpaidCnt = unpaidStats && unpaidStats.count !== undefined ? unpaidStats.count : (eodData.unpaid_count || 0);
        const unpaidAmt = unpaidStats && unpaidStats.amount !== undefined ? unpaidStats.amount : (eodData.unpaid_amount || 0);
        const unpaidFmt = formatDotNum(unpaidAmt);

        const shiftsByKey = eodData.shifts_by_key || {};
        const ca1 = { ...(shiftsByKey.thungan1 || eodData), unpaid_count: unpaidCnt, unpaid_amount_formatted: unpaidFmt };
        const ca2 = { ...(shiftsByKey.thungan2 || eodData), unpaid_count: unpaidCnt, unpaid_amount_formatted: unpaidFmt };
        const combined = { ...(shiftsByKey.all || eodData), unpaid_count: unpaidCnt, unpaid_amount_formatted: unpaidFmt };

        if (thermalBadge) thermalBadge.textContent = 'BÁO CÁO CUỐI NGÀY (2 CA THUNGAN1 & 2) • K80';
        if (thermalTitle) {
            thermalTitle.textContent = `Báo cáo cuối ngày (${eodData.date_display || ''}) — Ca 1 (thungan1) & Ca 2 (thungan2)`;
        }
        if (thermalBtnDone) {
            thermalBtnDone.textContent = 'Đóng cửa sổ';
        }
        if (thermalBtnOpenTab) {
            const params = new URLSearchParams({
                mode: 'summary',
                shift: shiftFilter || 'all',
                unpaid_count: String(unpaidCnt),
                unpaid_amount: String(unpaidAmt),
            });
            thermalBtnOpenTab.href = `/sales/end-of-day/print/?${params.toString()}`;
            thermalBtnOpenTab.hidden = false;
        }

        let slipsHtml = '';
        if (shiftFilter === 'thungan1') {
            thermalDialog?.classList.add('single-slip');
            slipsHtml = buildShiftReportSlipHtml(ca1, 'BÁO CÁO KẾT CA', 'Ca 1 - Thu Ngân 1 (thungan1)');
        } else if (shiftFilter === 'thungan2') {
            thermalDialog?.classList.add('single-slip');
            slipsHtml = buildShiftReportSlipHtml(ca2, 'BÁO CÁO KẾT CA', 'Ca 2 - Thu Ngân 2 (thungan2)');
        } else {
            thermalDialog?.classList.remove('single-slip');
            slipsHtml =
                buildShiftReportSlipHtml(ca1, 'BÁO CÁO KẾT CA', 'Ca 1 - Thu Ngân 1 (thungan1)') +
                buildShiftReportSlipHtml(ca2, 'BÁO CÁO KẾT CA', 'Ca 2 - Thu Ngân 2 (thungan2)') +
                buildShiftReportSlipHtml(combined, 'BÁO CÁO CUỐI NGÀY', 'Tổng hợp cả 2 ca: Thu Ngân 1 & Thu Ngân 2');
        }

        ensureThermalModalOnBody();
        thermalHost.innerHTML = slipsHtml;
        thermalModal.hidden = false;
        document.body.classList.add('pos-printing-thermal');

        triggerBrowserThermalPrint();
    };
});
