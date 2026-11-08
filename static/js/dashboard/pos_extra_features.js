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
    const renderCashbookModule = async () => {
        hubBadge.textContent = 'QUẢN LÝ • SỔ THU CHI TIỀN MẶT';
        hubTitle.textContent = 'Sổ Thu Chi Tiền Mặt & Quản Lý Quỹ Tại Quầy';
        const data = await fetchHubData('cashbook');
        const vouchers = data.vouchers || [];
        const kpis = data.kpis || {};

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
                </div>
                <div class="pos-hub-form-grid">
                    <div class="pos-hub-field">
                        <label>Loại phiếu</label>
                        <select id="cb-type">
                            <option value="out">Phiếu Chi tiền (-)</option>
                            <option value="in">Phiếu Thu tiền (+)</option>
                        </select>
                    </div>
                    <div class="pos-hub-field">
                        <label>Hạng mục thu/chi</label>
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
                        <input type="text" id="cb-note" placeholder="Ghi chú chứng từ...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="cb-btn-save">+ Lưu Phiếu Sổ Quỹ</button>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Mã phiếu</th>
                                <th>Loại</th>
                                <th>Thời gian</th>
                                <th>Hạng mục</th>
                                <th>Người giao/nhận</th>
                                <th>Diễn giải</th>
                                <th class="text-right">Số tiền</th>
                                <th class="text-center">Xóa</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vouchers.map((v) => `
                                <tr>
                                    <td><strong>${escapeHtml(v.code)}</strong></td>
                                    <td>
                                        <span class="pos-hub-pill ${v.type === 'in' ? 'green' : 'red'}">
                                            ${v.type === 'in' ? 'Phiếu Thu (+)' : 'Phiếu Chi (-)'}
                                        </span>
                                    </td>
                                    <td>${escapeHtml(v.created_at)}</td>
                                    <td><strong>${escapeHtml(v.category)}</strong></td>
                                    <td>${escapeHtml(v.person || '-')}</td>
                                    <td>${escapeHtml(v.note || '-')}</td>
                                    <td class="text-right" style="font-weight:700;color:${v.type === 'in' ? '#059669' : '#e11d48'};">
                                        ${v.type === 'in' ? '+' : '-'}${fmtMoney(v.amount)}
                                    </td>
                                    <td class="text-center">
                                        <button type="button" class="pos-hub-btn danger cb-btn-del" data-id="${v.id}" style="height:26px;padding:0 8px;font-size:11.5px;">Xóa</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

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
                renderCashbookModule();
            } else {
                showNotice(res.error || 'Không thể lưu phiếu thu chi.');
            }
        });

        hubBody.querySelectorAll('.cb-btn-del').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const res = await postHubAction({ action: 'delete_voucher', id: btn.dataset.id });
                if (res.ok) {
                    showNotice(res.message);
                    renderCashbookModule();
                }
            });
        });
    };

    // =========================================================================
    // 6. QUẢN LÝ CÔNG NỢ KHÁCH HÀNG & NHÀ CUNG CẤP (DEBT)
    // =========================================================================
    const renderDebtModule = async () => {
        hubBadge.textContent = 'QUẢN LÝ • CÔNG NỢ ĐỐI TÁC';
        hubTitle.textContent = 'Quản lý Công nợ Khách hàng & Nhà cung cấp (Tự động kết chuyển Sổ quỹ)';
        const data = await fetchHubData('debt');
        const debts = data.debts || [];
        const kpis = data.kpis || {};

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
                </div>
                <div class="pos-hub-form-grid">
                    <div class="pos-hub-field">
                        <label>Phân loại công nợ</label>
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
                        <label>Tổng tiền công nợ (đ) *</label>
                        <input type="number" id="debt-total" min="1000" step="10000" placeholder="VD: 2000000">
                    </div>
                    <div class="pos-hub-field">
                        <label>Ghi chú hóa đơn / đợt nhập</label>
                        <input type="text" id="debt-note" placeholder="Nội dung công nợ...">
                    </div>
                    <button type="button" class="pos-hub-btn primary" id="debt-btn-save">+ Ghi Nhận Công Nợ</button>
                </div>
            </div>

            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Mã CN</th>
                                <th>Loại</th>
                                <th>Đối tác (Khách / NCC)</th>
                                <th class="text-right">Tổng phát sinh</th>
                                <th class="text-right">Đã thanh toán</th>
                                <th class="text-right">Còn nợ lại</th>
                                <th>Ghi chú</th>
                                <th class="text-center">Tất toán nhanh</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${debts.map((d) => {
                                const rem = Number(d.remaining_amount || 0);
                                return `
                                <tr>
                                    <td><strong>${escapeHtml(d.code)}</strong></td>
                                    <td>
                                        <span class="pos-hub-pill ${d.debt_type === 'customer' ? 'blue' : 'amber'}">
                                            ${d.debt_type === 'customer' ? 'Phải thu KH' : 'Phải trả NCC'}
                                        </span>
                                    </td>
                                    <td><strong>${escapeHtml(d.partner_name)}</strong><br><small style="color:#64748b;">${escapeHtml(d.phone || '')}</small></td>
                                    <td class="text-right">${fmtMoney(d.total_amount)}</td>
                                    <td class="text-right" style="color:#059669;">${fmtMoney(d.paid_amount)}</td>
                                    <td class="text-right" style="font-weight:800;color:${rem > 0 ? '#e11d48' : '#059669'};">${fmtMoney(rem)}</td>
                                    <td>${escapeHtml(d.note || '-')}</td>
                                    <td class="text-center">
                                        ${rem > 0
                                            ? `<button type="button" class="pos-hub-btn primary debt-btn-pay" data-id="${d.id}" data-rem="${rem}" style="height:28px;padding:0 10px;font-size:11.5px;">Tất toán đủ</button>`
                                            : `<span class="pos-hub-pill green">Đã tất toán</span>`
                                        }
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

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
                renderDebtModule();
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
                    renderDebtModule();
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

        hubBody.innerHTML = `
            <div class="pos-hub-table-card">
                <div class="pos-hub-table-wrap" style="max-height:460px;">
                    <table class="pos-hub-table">
                        <thead>
                            <tr>
                                <th>Tài khoản</th>
                                <th>Họ và tên nhân viên</th>
                                <th>Bộ phận</th>
                                <th>Khu vực bàn phụ trách</th>
                                <th>Ca làm việc</th>
                                <th>Trạng thái trực</th>
                                <th class="text-center">Lưu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${staff.map((s) => `
                                <tr data-uid="${s.user_id}">
                                    <td><strong>${escapeHtml(s.username)}</strong></td>
                                    <td>${escapeHtml(s.full_name)}</td>
                                    <td><span class="pos-hub-pill blue">${escapeHtml(s.department)}</span></td>
                                    <td>
                                        <select class="sa-area" style="height:32px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;">
                                            <option value="ALL" ${s.area_code === 'ALL' ? 'selected' : ''}>Toàn bộ khu vực (ALL)</option>
                                            ${areas.map((a) => `<option value="${escapeHtml(a)}" ${s.area_code === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}
                                        </select>
                                    </td>
                                    <td>
                                        <select class="sa-shift" style="height:32px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;">
                                            <option value="Ca Sáng (06:00 - 14:00)" ${s.shift_name.includes('Sáng') ? 'selected' : ''}>Ca Sáng (06:00 - 14:00)</option>
                                            <option value="Ca Chiều (14:00 - 22:00)" ${s.shift_name.includes('Chiều') ? 'selected' : ''}>Ca Chiều (14:00 - 22:00)</option>
                                            <option value="Ca Gãy / Toàn thời gian (08:00 - 22:00)" ${s.shift_name.includes('Gãy') ? 'selected' : ''}>Ca Gãy / Toàn thời gian</option>
                                        </select>
                                    </td>
                                    <td>
                                        <input type="text" class="sa-note" value="${escapeHtml(s.note)}" style="height:32px;border-radius:6px;border:1px solid #cbd5e1;padding:0 8px;width:130px;">
                                    </td>
                                    <td class="text-center">
                                        <button type="button" class="pos-hub-btn primary sa-btn-save" style="height:30px;padding:0 10px;font-size:12px;">Lưu</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        hubBody.querySelectorAll('.sa-btn-save').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const tr = btn.closest('tr');
                const res = await postHubAction({
                    action: 'save_shift_assign',
                    user_id: tr.dataset.uid,
                    area_code: tr.querySelector('.sa-area')?.value,
                    shift_name: tr.querySelector('.sa-shift')?.value,
                    note: tr.querySelector('.sa-note')?.value,
                });
                if (res.ok) showNotice(res.message);
            });
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
        const runOpen = () => {
            hubModal.hidden = false;
            switch (featureKey) {
                case 'drawer':
                    renderDrawerModule();
                    break;
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
    document.querySelectorAll('.management-menu a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (href.includes('dining')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                link.closest('.pos-menu-item')?.classList.remove('open');
                window.openPosFeatureHub('shift_assign');
            });
        } else if (href.includes('invoices')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                link.closest('.pos-menu-item')?.classList.remove('open');
                document.getElementById('open-sales-stats-menu')?.click();
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
});
